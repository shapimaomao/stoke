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

  const [activeTab, setActiveTab] = useState<'ledger' | 'analytics' | 'positions' | 'strategies' | 'import'>('ledger');
  
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

  // 2. Subscribe to Firestore when user is authenticated with Firebase Auth
  useEffect(() => {
    if (!user || user.uid === 'local_user' || !auth.currentUser) return;

    try {
      const q = query(collection(db, 'trades'), where('userId', '==', user.uid));
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
          setTrades(recalculateTradesChronologically(firestoreTrades));
        } else if (hasCleared) {
          setTrades([]);
        } else {
          // If Firestore is empty, auto upload local trades so nothing is lost!
          const saved = localStorage.getItem('local_stock_trades');
          if (saved) {
            try {
              const localTrades: TradeRecord[] = JSON.parse(saved);
              if (localTrades.length > 0) {
                const batch = writeBatch(db);
                localTrades.forEach(t => {
                  if (t.id) {
                    const docRef = doc(db, 'trades', t.id);
                    batch.set(docRef, { ...t, userId: user.uid }, { merge: true });
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

  // 3. Subscribe to Grid Configs in Firestore
  useEffect(() => {
    if (!user || user.uid === 'local_user' || !auth.currentUser) return;

    try {
      const q = query(collection(db, 'gridConfigs'), where('userId', '==', user.uid));
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

    if (user && user.uid !== 'local_user' && auth.currentUser) {
      try {
        const docRef = doc(db, 'gridConfigs', config.stockCode);
        await setDoc(docRef, { ...config, userId: user.uid }, { merge: true });
      } catch (e) {
        console.error('Save grid config to Firestore error:', e);
      }
    }
    showToast(`💾 已成功保存 ${config.stockName} 的定制网格策略与规划图！`);
  };

  const handleDeleteGridConfig = async (stockCode: string) => {
    setGridConfigs(prev => prev.filter(c => c.stockCode !== stockCode));
    if (user && user.uid !== 'local_user' && auth.currentUser) {
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

  // Filtered trades by selected stock
  const displayTrades = useMemo(() => {
    if (!selectedStockCode) return trades;
    return trades.filter(t => t.stockCode === selectedStockCode);
  }, [trades, selectedStockCode]);

  // Explicit Save & Sync All Trades to Database Handler
  const handleSaveAndSyncToDb = async () => {
    localStorage.setItem('local_stock_trades', JSON.stringify(trades));
    if (user && user.uid !== 'local_user' && auth.currentUser) {
      try {
        const batch = writeBatch(db);
        trades.forEach(t => {
          if (t.id) {
            const docRef = doc(db, 'trades', t.id);
            batch.set(docRef, { ...t, userId: user.uid }, { merge: true });
          }
        });
        await batch.commit();
        showToast('💾 全部交易数据已成功保存，全量增量已同步至 Cloud Firestore 数据库！');
      } catch (e) {
        console.error('Save to db error:', e);
        showToast('💾 交易数据已成功保存至本地数据库！');
      }
    } else {
      showToast('💾 交易数据已保存至本地数据库！注册/登录账号即可无缝同步到云端数据库。');
    }
  };

  // Add / Edit Trade Handler
  const handleSaveTrade = async (partialTrade: Partial<TradeRecord>) => {
    const now = new Date().toISOString();
    const existingId = partialTrade.id;
    const isEdit = Boolean(existingId && trades.some(t => t.id === existingId));

    if (isEdit && existingId) {
      // Update existing trade in-place
      if (user && user.uid !== 'local_user' && auth.currentUser) {
        try {
          const docRef = doc(db, 'trades', existingId);
          await setDoc(docRef, {
            ...partialTrade,
            id: existingId,
            userId: user.uid,
            updatedAt: now,
          }, { merge: true });
        } catch (e) {
          console.error('Firestore update error:', e);
        }
      }

      setTrades(prev => recalculateTradesChronologically(
        prev.map(t => t.id === existingId ? { ...t, ...partialTrade, updatedAt: now } as TradeRecord : t)
      ));
      showToast('💾 交易明细修改成功，已更新同步！');
    } else {
      // Create new trade
      let newId = existingId || `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      if (user && user.uid !== 'local_user' && auth.currentUser) {
        try {
          const newDocRef = doc(collection(db, 'trades'));
          newId = newDocRef.id;
          const newTradeData = {
            ...partialTrade,
            id: newId,
            userId: user.uid,
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
        userId: user ? user.uid : 'local_user',
        createdAt: now,
        updatedAt: now,
      } as TradeRecord;

      setTrades(prev => recalculateTradesChronologically([newTradeRecord, ...prev]));
      showToast((user && user.uid !== 'local_user' && auth.currentUser) ? '💾 新增交易已成功保存并同步到云端数据库！' : '💾 新增交易已成功保存到本地数据库！');
    }
  };

  // Toggle Note Completed Status Handler
  const handleToggleNoteCompleted = async (tradeId: string) => {
    const targetTrade = trades.find(t => t.id === tradeId);
    if (!targetTrade) return;

    const newCompleted = !targetTrade.notesCompleted;
    const now = new Date().toISOString();

    setTrades(prev => prev.map(t => t.id === tradeId ? { ...t, notesCompleted: newCompleted, updatedAt: now } : t));

    if (user && user.uid !== 'local_user' && auth.currentUser) {
      try {
        const docRef = doc(db, 'trades', tradeId);
        await updateDoc(docRef, { notesCompleted: newCompleted, updatedAt: now });
      } catch (e) {
        console.error('Update note completion status error:', e);
      }
    }
    showToast(newCompleted ? '✅ 备注说明已标为“已完成”，颜色变为绿色' : 'ℹ️ 备注说明已重置为“未完成”，颜色恢复为橙色');
  };

  // Delete Trades Handler
  const handleDeleteTrades = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;

    if (user && user.uid !== 'local_user' && auth.currentUser) {
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

    setTrades(prev => {
      const remaining = prev.filter(t => !ids.includes(t.id));
      if (remaining.length === 0) {
        localStorage.setItem('user_has_cleared_trades', 'true');
      }
      return remaining;
    });
  };

  // Import Batch Excel Success
  const handleImportSuccess = async (importedList: Partial<TradeRecord>[]) => {
    const now = new Date().toISOString();
    const newRecords: TradeRecord[] = [];

    if (user && user.uid !== 'local_user' && auth.currentUser) {
      try {
        const batch = writeBatch(db);
        importedList.forEach((t) => {
          const newDocRef = doc(collection(db, 'trades'));
          const newId = newDocRef.id;
          const recordData = {
            ...t,
            id: newId,
            userId: user.uid,
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

    setTrades(prev => recalculateTradesChronologically([...newRecords, ...prev]));
    setActiveTab('ledger');
  };

  const handleLoadDemoData = () => {
    localStorage.removeItem('user_has_cleared_trades');
    setTrades(recalculateTradesChronologically(INITIAL_DEMO_TRADES));
  };

  const handleExportExcel = () => {
    exportTradesToExcel(trades);
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
        onOpenTradeForm={() => { setEditingTrade(null); setIsTradeFormOpen(true); }}
        onExportExcel={handleExportExcel}
        onLoadDemoData={handleLoadDemoData}
        onSaveAndSync={handleSaveAndSyncToDb}
        isCloudSynced={isCloudSynced}
        tradeCount={trades.length}
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
                onEditTrade={(trade) => { setEditingTrade(trade); setIsTradeFormOpen(true); }}
                onDeleteTrades={handleDeleteTrades}
                onAddNewTrade={() => { setEditingTrade(null); setIsTradeFormOpen(true); }}
                onExportExcel={handleExportExcel}
                onSaveAndSync={handleSaveAndSyncToDb}
                onToggleNoteCompleted={handleToggleNoteCompleted}
              />
            </div>

            {/* Mobile View */}
            <div className="md:hidden">
              <TradeCardList
                trades={displayTrades}
                onEditTrade={(trade) => { setEditingTrade(trade); setIsTradeFormOpen(true); }}
                onDeleteTrades={handleDeleteTrades}
                onAddNewTrade={() => { setEditingTrade(null); setIsTradeFormOpen(true); }}
                onToggleNoteCompleted={handleToggleNoteCompleted}
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
