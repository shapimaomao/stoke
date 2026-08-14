/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  auth, 
  db, 
  onAuthStateChanged, 
  signInAnonymously,
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  writeBatch,
  query, 
  where, 
  onSnapshot,
  User 
} from './lib/firebase';

import { TradeRecord, UserProfile, PerformanceMetrics, StrategyType, GridStrategyConfig } from './types';
import { INITIAL_DEMO_TRADES } from './data/demoData';
import { calculatePerformanceMetrics, recalculateTradesChronologically } from './lib/calculator';
import { exportTradesToExcel } from './lib/excel';

import { Navbar } from './components/Navbar';
import { DashboardStats } from './components/DashboardStats';
import { TradeTable } from './components/TradeTable';
import { TradeCardList } from './components/TradeCardList';
import { TradeFormModal } from './components/TradeFormModal';
import { ExcelImportModal } from './components/ExcelImportModal';
import { AnalyticsCharts } from './components/AnalyticsCharts';
import { StrategyManager } from './components/StrategyManager';
import { PositionsSummary } from './components/PositionsSummary';
import { NotesTaskBoard } from './components/NotesTaskBoard';
import { AuthModal } from './components/AuthModal';
import { StockQuickSelector } from './components/StockQuickSelector';
import { PendingFundTradesBanner } from './components/PendingFundTradesBanner';
import { PasscodeGate } from './components/PasscodeGate';

import { Cloud, FileSpreadsheet, PlusCircle, RefreshCw, Layers } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);

  // Initialize trades from local storage if available so data is preserved across builds
  const [trades, setTrades] = useState<TradeRecord[]>(() => {
    const hasCleared = localStorage.getItem('user_has_cleared_trades') === 'true';
    const saved = localStorage.getItem('local_stock_trades');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return recalculateTradesChronologically(parsed);
        }
      } catch (e) {}
    }
    return hasCleared ? [] : recalculateTradesChronologically(INITIAL_DEMO_TRADES);
  });

  // History Stack State for Undo (撤销) & Redo (重做)
  const [historyStack, setHistoryStack] = useState<TradeRecord[][]>(() => [trades]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyStack.length - 1;

  // Helper to apply trades update with chronological recalculation and history push
  const updateTradesWithHistory = (newTradesRaw: TradeRecord[]) => {
    const recalculated = recalculateTradesChronologically(newTradesRaw);
    setTrades(recalculated);
    setHistoryStack(prev => {
      const activeSlice = historyIndex >= 0 ? prev.slice(0, historyIndex + 1) : [];
      return [...activeSlice, recalculated];
    });
    setHistoryIndex(prev => prev + 1);
    localStorage.setItem('local_stock_trades', JSON.stringify(recalculated));
  };

  // Undo Handler
  const handleUndo = () => {
    if (historyIndex <= 0) return;
    const prevIndex = historyIndex - 1;
    const prevTrades = historyStack[prevIndex];
    const recalculated = recalculateTradesChronologically(prevTrades);
    setTrades(recalculated);
    setHistoryIndex(prevIndex);
    localStorage.setItem('local_stock_trades', JSON.stringify(recalculated));
    showToast('↩️ 已成功撤销上一步操作！');
  };

  // Redo Handler
  const handleRedo = () => {
    if (historyIndex >= historyStack.length - 1) return;
    const nextIndex = historyIndex + 1;
    const nextTrades = historyStack[nextIndex];
    const recalculated = recalculateTradesChronologically(nextTrades);
    setTrades(recalculated);
    setHistoryIndex(nextIndex);
    localStorage.setItem('local_stock_trades', JSON.stringify(recalculated));
    showToast('↪️ 已成功重做操作！');
  };

  // Global Keyboard Shortcuts for Undo (Ctrl+Z) & Redo (Ctrl+Y / Cmd+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl && 
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (canUndo) handleUndo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        if (canRedo) handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, historyIndex, historyStack]);

  // Grid Strategy Configs State with Persistence
  const [gridConfigs, setGridConfigs] = useState<GridStrategyConfig[]>(() => {
    const saved = localStorage.getItem('local_grid_configs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });

  const [activeTab, setActiveTab] = useState<'ledger' | 'analytics' | 'positions' | 'strategies' | 'import' | 'notes'>('ledger');

  const pendingNotesCount = useMemo(() => {
    return trades.filter(t => t.notes && t.notes.trim().length > 0 && (
      t.notesStatus === 'pending' || (t.notesStatus !== 'completed' && !t.notesCompleted)
    )).length;
  }, [trades]);
  
  // Stock Quick Filter State
  const [selectedStockCode, setSelectedStockCode] = useState<string | null>(null);
  const [quickStockInfo, setQuickStockInfo] = useState<{
    stockCode: string;
    stockName: string;
    account: string;
    strategyName: string;
    strategyType: StrategyType;
  } | null>(null);

  // Modals state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isTradeFormOpen, setIsTradeFormOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<TradeRecord | null>(null);

  const [isCloudSynced, setIsCloudSynced] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Persist gridConfigs locally
  useEffect(() => {
    localStorage.setItem('local_grid_configs', JSON.stringify(gridConfigs));
  }, [gridConfigs]);

  // 1. Firebase Auth listener - Auto connect single user session
  useEffect(() => {
    if (!auth) {
      setUser({
        uid: 'local_user',
        email: null,
        displayName: '本地专属账户',
        isAnonymous: true,
      });
      setIsCloudSynced(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || '专属个人账户',
          isAnonymous: firebaseUser.isAnonymous,
        });
        setIsCloudSynced(true);
      } else {
        // Auto authenticate seamlessly for single-user system
        try {
          await signInAnonymously(auth);
        } catch (err: any) {
          console.warn("Auto sign in skipped (using local storage fallback):", err?.message || err);
          setUser({
            uid: 'local_user',
            email: null,
            displayName: '本地专属账户',
            isAnonymous: true,
          });
          setIsCloudSynced(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Subscribe to Firestore trades for real-time multi-device sync (Preview, Desktop & Mobile)
  useEffect(() => {
    if (!db) return;

    try {
      const q = collection(db, 'trades');
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const firestoreTrades: TradeRecord[] = [];
        snapshot.forEach((docSnap) => {
          firestoreTrades.push({
            ...docSnap.data(),
            id: docSnap.id,
          } as TradeRecord);
        });

        firestoreTrades.sort((a, b) => new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime());
        
        const hasCleared = localStorage.getItem('user_has_cleared_trades') === 'true';

        if (firestoreTrades.length > 0) {
          setTrades(prevLocal => {
            const map = new Map<string, TradeRecord>();
            // Add Firestore trades
            firestoreTrades.forEach(t => { if (t.id) map.set(t.id, t); });
            // Preserve local trades that might not be in Firestore yet (unless cleared)
            if (!hasCleared) {
              prevLocal.forEach(t => {
                if (t.id && !map.has(t.id)) {
                  map.set(t.id, t);
                }
              });
            }
            const merged = Array.from(map.values());
            return recalculateTradesChronologically(merged);
          });
          setIsCloudSynced(true);
        } else if (hasCleared) {
          setTrades([]);
          setIsCloudSynced(true);
        } else {
          // If Firestore is empty, auto upload local trades so initial demo or local data is synced
          const saved = localStorage.getItem('local_stock_trades');
          if (saved) {
            try {
              const localTrades: TradeRecord[] = JSON.parse(saved);
              if (localTrades.length > 0) {
                const batch = writeBatch(db);
                localTrades.forEach(t => {
                  if (t.id) {
                    const docRef = doc(db, 'trades', t.id);
                    batch.set(docRef, { ...t, userId: user?.uid || 'shared_user' }, { merge: true });
                  }
                });
                batch.commit().catch(e => console.warn('Auto upload local trades error:', e));
              }
            } catch (e) {}
          }
        }
      }, (err) => {
        console.warn('Firestore subscription error:', err);
        setIsCloudSynced(false);
      });

      return () => unsubscribe();
    } catch (e) {
      console.warn('Firestore subscription exception:', e);
    }
  }, [user]);

  // 3. Subscribe to Grid Configs in Firestore for real-time multi-device sync
  useEffect(() => {
    if (!db) return;

    try {
      const q = collection(db, 'gridConfigs');
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items: GridStrategyConfig[] = [];
        snapshot.forEach((docSnap) => {
          items.push({
            ...docSnap.data(),
            id: docSnap.id,
          } as GridStrategyConfig);
        });

        if (items.length > 0) {
          setGridConfigs(items);
          localStorage.setItem('local_grid_configs', JSON.stringify(items));
        }
      }, (err) => console.warn('Grid configs Firestore sync warning:', err));

      return () => unsubscribe();
    } catch (e) {
      console.warn('Grid configs subscription exception:', e);
    }
  }, [user]);

  // Persist trades locally as fallback
  useEffect(() => {
    localStorage.setItem('local_stock_trades', JSON.stringify(trades));
  }, [trades]);

  // Save / Delete Grid Config Handlers
  const handleSaveGridConfig = async (config: GridStrategyConfig) => {
    setGridConfigs(prev => {
      const exists = prev.some(c => c.stockCode === config.stockCode);
      if (exists) {
        return prev.map(c => c.stockCode === config.stockCode ? config : c);
      } else {
        return [...prev, config];
      }
    });

    if (db) {
      try {
        const docRef = doc(db, 'gridConfigs', config.stockCode);
        await setDoc(docRef, { ...config, userId: user?.uid || 'shared_user' }, { merge: true });
      } catch (e) {
        console.error('Save grid config to Firestore error:', e);
      }
    }
    showToast(`💾 已成功保存 ${config.stockName} 的定制网格策略与规划图！`);
  };

  const handleDeleteGridConfig = async (stockCode: string) => {
    setGridConfigs(prev => prev.filter(c => c.stockCode !== stockCode));
    if (db) {
      try {
        await deleteDoc(doc(db, 'gridConfigs', stockCode));
      } catch (e) {
        console.error('Delete grid config from Firestore error:', e);
      }
    }
    showToast('已删除对应网格策略配置');
  };

  // Real-time Overall Performance Metrics
  const metrics: PerformanceMetrics = useMemo(() => {
    return calculatePerformanceMetrics(trades);
  }, [trades]);

  // Filtered trades by selected stock with smart multi-attribute matching
  const displayTrades = useMemo(() => {
    if (!selectedStockCode) return trades;
    
    const filterKey = selectedStockCode.trim().toLowerCase();
    
    // Collect all related codes/names associated with this selected stock
    const matchingCodes = new Set<string>();
    const matchingNames = new Set<string>();
    matchingCodes.add(filterKey);
    matchingNames.add(filterKey);

    trades.forEach(t => {
      const c = (t.stockCode || '').trim().toLowerCase();
      const n = (t.stockName || '').trim().toLowerCase();
      if ((c && c === filterKey) || (n && n === filterKey)) {
        if (c) matchingCodes.add(c);
        if (n) matchingNames.add(n);
      }
    });

    return trades.filter(t => {
      const code = (t.stockCode || '').trim().toLowerCase();
      const name = (t.stockName || '').trim().toLowerCase();
      return (code && matchingCodes.has(code)) || (name && matchingNames.has(name));
    });
  }, [trades, selectedStockCode]);

  // Add New Trade Handler - defaults to selected stock if currently filtered
  const handleAddNewTrade = () => {
    setEditingTrade(null);
    if (selectedStockCode) {
      const filterKey = selectedStockCode.trim().toLowerCase();
      const matchingTrade = trades.find(t => 
        (t.stockCode && t.stockCode.trim().toLowerCase() === filterKey) || 
        (t.stockName && t.stockName.trim().toLowerCase() === filterKey)
      );

      if (matchingTrade) {
        setQuickStockInfo({
          stockCode: matchingTrade.stockCode,
          stockName: matchingTrade.stockName,
          account: matchingTrade.account,
          strategyName: matchingTrade.strategyName,
          strategyType: matchingTrade.strategyType,
        });
      } else {
        const isCode = /^\d+/.test(selectedStockCode);
        setQuickStockInfo({
          stockCode: isCode ? selectedStockCode : '',
          stockName: !isCode ? selectedStockCode : '',
          account: '华泰证券',
          strategyName: '网格套利',
          strategyType: '自己',
        });
      }
    } else {
      setQuickStockInfo(null);
    }
    setIsTradeFormOpen(true);
  };

  // Explicit Save & Sync All Trades to Database Handler
  const handleSaveAndSyncToDb = async () => {
    localStorage.setItem('local_stock_trades', JSON.stringify(trades));
    if (db) {
      try {
        const batch = writeBatch(db);
        trades.forEach(t => {
          if (t.id) {
            const docRef = doc(db, 'trades', t.id);
            batch.set(docRef, { ...t, userId: user?.uid || 'shared_user' }, { merge: true });
          }
        });
        await batch.commit();
        showToast('💾 全部交易数据已成功保存，全量增量已多端实时同步至 Cloud Firestore 数据库！');
      } catch (e) {
        console.error('Save to db error:', e);
        showToast('💾 交易数据已成功保存至本地数据库！');
      }
    } else {
      showToast('💾 交易数据已保存至本地数据库！');
    }
  };

  // Add / Edit Trade Handler
  const handleSaveTrade = async (partialTrade: Partial<TradeRecord>) => {
    const now = new Date().toISOString();
    const existingId = partialTrade.id;
    const isEdit = Boolean(existingId && trades.some(t => t.id === existingId));

    let updatedList: TradeRecord[] = [];

    if (isEdit && existingId) {
      // Update existing trade in-place
      if (db) {
        try {
          const docRef = doc(db, 'trades', existingId);
          await setDoc(docRef, {
            ...partialTrade,
            id: existingId,
            userId: user?.uid || 'shared_user',
            updatedAt: now,
          }, { merge: true });
        } catch (e) {
          console.error('Firestore update error:', e);
        }
      }

      updatedList = trades.map(t => t.id === existingId ? { ...t, ...partialTrade, updatedAt: now } as TradeRecord : t);
      showToast('💾 交易已更新并已实时推送至云端！全部历史已按时间轴重新对算！');
    } else {
      // Create new trade
      let newId = existingId || `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      if (db) {
        try {
          const newDocRef = doc(collection(db, 'trades'));
          newId = newDocRef.id;
          const newTradeData = {
            ...partialTrade,
            id: newId,
            userId: user?.uid || 'shared_user',
            createdAt: now,
            updatedAt: now,
          };
          await setDoc(newDocRef, newTradeData);
        } catch (e) {
          console.error('Firestore add error:', e);
        }
      }

      const newTradeRecord: TradeRecord = {
        ...partialTrade,
        id: newId,
        userId: user ? user.uid : 'shared_user',
        createdAt: now,
        updatedAt: now,
      } as TradeRecord;

      updatedList = [newTradeRecord, ...trades];
      showToast('💾 新增交易已同步云端！预览端、电脑端与手机端已实时对算同步！');
    }

    updateTradesWithHistory(updatedList);
  };

  // Set Note Status Handler (pending = 未完成 / 橙色, completed = 完成 / 绿色, none = 默认 / 白色)
  const handleSetNoteStatus = async (tradeId: string, status: 'pending' | 'completed' | 'none') => {
    const targetTrade = trades.find(t => t.id === tradeId);
    if (!targetTrade) return;

    const isCompleted = status === 'completed';
    const now = new Date().toISOString();

    setTrades(prev => prev.map(t => t.id === tradeId ? { ...t, notesStatus: status, notesCompleted: isCompleted, updatedAt: now } : t));

    if (db) {
      try {
        const docRef = doc(db, 'trades', tradeId);
        await updateDoc(docRef, { notesStatus: status, notesCompleted: isCompleted, updatedAt: now });
      } catch (e) {
        console.error('Update note status error:', e);
      }
    }

    if (status === 'completed') {
      showToast('✅ 备注已标记为“完成”，文字已变绿');
    } else if (status === 'pending') {
      showToast('📙 备注已标记为“未完成”，文字已变橙');
    } else {
      showToast('⚪ 备注标记已重置，文字恢复默认白色');
    }
  };

  // Toggle Note Completed Status Handler
  const handleToggleNoteCompleted = async (tradeId: string) => {
    const targetTrade = trades.find(t => t.id === tradeId);
    if (!targetTrade) return;

    const currentStatus = targetTrade.notesStatus || (targetTrade.notesCompleted ? 'completed' : 'none');
    const nextStatus = currentStatus === 'completed' ? 'none' : 'completed';
    await handleSetNoteStatus(tradeId, nextStatus);
  };

  // Delete Trades Handler
  const handleDeleteTrades = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;

    if (db) {
      try {
        const batch = writeBatch(db);
        ids.forEach(id => {
          if (!id.startsWith('demo_')) {
            const docRef = doc(db, 'trades', id);
            batch.delete(docRef);
          }
        });
        await batch.commit();
      } catch (e) {
        console.error('Firestore batch delete error:', e);
      }
    }

    const remaining = trades.filter(t => !ids.includes(t.id));
    if (remaining.length === 0) {
      localStorage.setItem('user_has_cleared_trades', 'true');
    }
    updateTradesWithHistory(remaining);
    showToast(`🗑️ 已成功删除 ${ids.length} 笔交易，云端多端已实时同步！`);
  };

  // Import Batch Excel Success
  const handleImportSuccess = async (importedList: Partial<TradeRecord>[]) => {
    const now = new Date().toISOString();
    const newRecords: TradeRecord[] = [];

    if (db) {
      try {
        const batch = writeBatch(db);
        importedList.forEach((t) => {
          const newDocRef = doc(collection(db, 'trades'));
          const newId = newDocRef.id;
          const recordData = {
            ...t,
            id: newId,
            userId: user?.uid || 'shared_user',
            createdAt: now,
          };
          batch.set(newDocRef, recordData);
          newRecords.push(recordData as TradeRecord);
        });
        await batch.commit();
      } catch (e) {
        console.error('Firestore import batch set error:', e);
      }
    } else {
      importedList.forEach((t, i) => {
        newRecords.push({
          ...t,
          id: `imp_${Date.now()}_${i}`,
          userId: user ? user.uid : 'local_user',
          createdAt: now,
        } as TradeRecord);
      });
    }

    updateTradesWithHistory([...newRecords, ...trades]);
    showToast(`📥 成功导入 ${newRecords.length} 笔记录，多端云端已实时更新！`);
    setActiveTab('ledger');
  };

  const handleLoadDemoData = () => {
    localStorage.removeItem('user_has_cleared_trades');
    updateTradesWithHistory(INITIAL_DEMO_TRADES);
    showToast('🔄 已加载示例数据，并重新倒排对算！');
  };

  // Smart Filtered Export Excel Handler
  const handleExportExcel = (customTrades?: TradeRecord[]) => {
    const listToExport = customTrades || displayTrades;
    if (!listToExport || listToExport.length === 0) {
      showToast('⚠️ 当前视图中暂无对账数据可供导出');
      return;
    }

    let filename = '股市对账单_交易明细.xlsx';

    // Single stock selected or custom trades filtered for a single stock
    if (selectedStockCode) {
      const targetObj = listToExport.find(t => t.stockCode === selectedStockCode || t.stockName === selectedStockCode) || listToExport[0];
      const stockName = targetObj?.stockName || selectedStockCode;
      const stockCode = targetObj?.stockCode || '';
      filename = `股市对账单_${stockName}${stockCode ? `_${stockCode}` : ''}.xlsx`;
    } else if (customTrades && customTrades.length < trades.length) {
      const firstStockName = customTrades[0]?.stockName || customTrades[0]?.stockCode;
      const isSingleStock = customTrades.every(t => t.stockCode === customTrades[0]?.stockCode || t.stockName === customTrades[0]?.stockName);
      if (isSingleStock && firstStockName) {
        filename = `股市对账单_${firstStockName}.xlsx`;
      } else {
        filename = `股市对账单_筛选细分对账.xlsx`;
      }
    }

    exportTradesToExcel(listToExport, filename);
    showToast(`📊 已导出对账单：${filename} (共 ${listToExport.length} 笔明细)`);
  };

  return (
    <PasscodeGate>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950 pb-16 md:pb-0 relative">
        {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-slate-900 text-emerald-300 border border-emerald-500/40 px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-2 text-xs sm:text-sm font-medium animate-bounce max-w-md">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onOpenTradeForm={handleAddNewTrade}
        onExportExcel={handleExportExcel}
        onLoadDemoData={handleLoadDemoData}
        onSaveAndSync={handleSaveAndSyncToDb}
        isCloudSynced={isCloudSynced}
        tradeCount={trades.length}
        pendingNotesCount={pendingNotesCount}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-[1920px] w-full mx-auto px-2 sm:px-3 lg:px-4 py-3 space-y-3">
        {/* KPI Performance Dashboard Banner - Available on all tabs */}
        <DashboardStats metrics={metrics} />

        {/* Pending Fund Trade Net Value Reminder Banner */}
        <PendingFundTradesBanner
          trades={trades}
          onSaveTrade={handleSaveTrade}
          onEditTrade={(trade) => { setEditingTrade(trade); setIsTradeFormOpen(true); }}
        />

        {/* Stock Quick Selector & Navigation Bar */}
        <StockQuickSelector
          trades={trades}
          selectedStockCode={selectedStockCode}
          onSelectStock={setSelectedStockCode}
          onQuickAddForStock={(stockInfo) => {
            setQuickStockInfo(stockInfo);
            setEditingTrade(null);
            setIsTradeFormOpen(true);
          }}
          gridConfigs={gridConfigs}
          onSaveGridConfig={handleSaveGridConfig}
          onDeleteGridConfig={handleDeleteGridConfig}
        />

        {/* Tab 1: Ledger Statement (对账单明细) */}
        {activeTab === 'ledger' && (
          <div>
            {/* Desktop View */}
            <div className="hidden md:block">
              <TradeTable
                trades={displayTrades}
                selectedStockCode={selectedStockCode}
                onEditTrade={(trade) => { setEditingTrade(trade); setIsTradeFormOpen(true); }}
                onDeleteTrades={handleDeleteTrades}
                onAddNewTrade={handleAddNewTrade}
                onExportExcel={handleExportExcel}
                onSaveAndSync={handleSaveAndSyncToDb}
                onToggleNoteCompleted={handleToggleNoteCompleted}
                onSetNoteStatus={handleSetNoteStatus}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={handleUndo}
                onRedo={handleRedo}
              />
            </div>

            {/* Mobile View */}
            <div className="md:hidden">
              <TradeCardList
                trades={displayTrades}
                selectedStockCode={selectedStockCode}
                onEditTrade={(trade) => { setEditingTrade(trade); setIsTradeFormOpen(true); }}
                onDeleteTrades={handleDeleteTrades}
                onAddNewTrade={handleAddNewTrade}
                onToggleNoteCompleted={handleToggleNoteCompleted}
                onSetNoteStatus={handleSetNoteStatus}
              />
            </div>
          </div>
        )}


        {/* Tab 2: Analytics Charts */}
        {activeTab === 'analytics' && (
          <AnalyticsCharts trades={trades} metrics={metrics} />
        )}

        {/* Tab 3: Positions Summary */}
        {activeTab === 'positions' && (
          <PositionsSummary 
            trades={trades} 
            gridConfigs={gridConfigs}
            onSaveGridConfig={handleSaveGridConfig}
            onDeleteGridConfig={handleDeleteGridConfig}
          />
        )}

        {/* Tab 4: Strategy Evaluator */}
        {activeTab === 'strategies' && (
          <StrategyManager 
            trades={trades} 
            gridConfigs={gridConfigs}
            onSaveGridConfig={handleSaveGridConfig}
            onDeleteGridConfig={handleDeleteGridConfig}
          />
        )}

        {/* Tab 5: Excel Import & Backup */}
        {activeTab === 'import' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl my-4 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <span>Excel 交易历史对账单导入与云端备份</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">导入您之前的 Excel 账单继续编辑，或一键导出当前云端对账单为标准 Excel 格式</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div 
                onClick={() => setIsImportModalOpen(true)}
                className="bg-slate-950 hover:bg-slate-900 border-2 border-dashed border-emerald-500/40 hover:border-emerald-400 rounded-2xl p-8 text-center cursor-pointer transition-all space-y-3 group"
              >
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto group-hover:scale-110 transition-all">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-bold text-slate-100 text-sm">打开 Excel 智能导入向导</div>
                  <div className="text-xs text-slate-500 mt-1">自动识别表头、格式校验、并批量存入云端数据库</div>
                </div>
              </div>

              <div 
                onClick={handleExportExcel}
                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-8 text-center cursor-pointer transition-all space-y-3 group"
              >
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto group-hover:scale-110 transition-all">
                  <Cloud className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-bold text-slate-100 text-sm">导出当前全量对账单 (.xlsx)</div>
                  <div className="text-xs text-slate-500 mt-1">导出包含19个完整字段的官方 Excel 备份明细</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Dedicated Notes Task Board (跟进待办板块) */}
        {activeTab === 'notes' && (
          <NotesTaskBoard
            trades={trades}
            onEditTrade={(trade) => { setEditingTrade(trade); setIsTradeFormOpen(true); }}
            onSetNoteStatus={handleSetNoteStatus}
            onAddNewTrade={handleAddNewTrade}
          />
        )}
      </main>

      {/* Modals */}
      <TradeFormModal
        isOpen={isTradeFormOpen}
        onClose={() => {
          setIsTradeFormOpen(false);
          setQuickStockInfo(null);
          setEditingTrade(null);
        }}
        onSave={(trade) => {
          handleSaveTrade(trade);
          setEditingTrade(null);
        }}
        initialTrade={editingTrade}
        existingTrades={trades}
        quickStockInfo={quickStockInfo}
      />


      <ExcelImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={handleImportSuccess}
        userId={user ? user.uid : 'local_user'}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        user={user}
      />
    </div>
    </PasscodeGate>
  );
}
