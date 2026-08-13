import React, { useState, useMemo } from 'react';
import { 
  ClipboardList, 
  CheckCircle2, 
  Clock, 
  Search, 
  Calendar, 
  Tag, 
  ArrowUpDown, 
  Edit3, 
  Check, 
  XCircle, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Filter,
  Layers,
  Sparkles,
  PlusCircle,
  FileText
} from 'lucide-react';
import { TradeRecord } from '../types';

interface NotesTaskBoardProps {
  trades: TradeRecord[];
  onEditTrade: (trade: TradeRecord) => void;
  onSetNoteStatus: (tradeId: string, status: 'pending' | 'completed' | 'none') => void;
  onAddNewTrade: () => void;
}

type StatusFilter = 'pending' | 'all' | 'completed';
type AssetFilter = 'all' | 'stock' | 'fund';
type GroupByMode = 'date' | 'stock' | 'flat';
type SortOrder = 'desc' | 'asc';

export const NotesTaskBoard: React.FC<NotesTaskBoardProps> = ({
  trades,
  onEditTrade,
  onSetNoteStatus,
  onAddNewTrade,
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [assetFilter, setAssetFilter] = useState<AssetFilter>('all');
  const [groupByMode, setGroupByMode] = useState<GroupByMode>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  // Get all trades with notes
  const tradesWithNotes = useMemo(() => {
    return trades.filter(t => t.notes && t.notes.trim().length > 0);
  }, [trades]);

  // Overall statistics
  const stats = useMemo(() => {
    let pendingCount = 0;
    let completedCount = 0;
    let pendingStockCount = 0;
    let pendingFundCount = 0;

    tradesWithNotes.forEach(t => {
      const isCompleted = t.notesStatus === 'completed' || (t.notesStatus !== 'pending' && t.notesCompleted);
      if (isCompleted) {
        completedCount++;
      } else {
        pendingCount++;
        if (t.assetType === 'fund') {
          pendingFundCount++;
        } else {
          pendingStockCount++;
        }
      }
    });

    return {
      totalWithNotes: tradesWithNotes.length,
      pendingCount,
      completedCount,
      pendingStockCount,
      pendingFundCount,
    };
  }, [tradesWithNotes]);

  // Filtered trades based on status, asset type, and search
  const filteredTrades = useMemo(() => {
    return tradesWithNotes.filter(t => {
      // 1. Status Filter
      const isCompleted = t.notesStatus === 'completed' || (t.notesStatus !== 'pending' && t.notesCompleted);
      if (statusFilter === 'pending' && isCompleted) return false;
      if (statusFilter === 'completed' && !isCompleted) return false;

      // 2. Asset Type Filter
      if (assetFilter === 'stock' && t.assetType === 'fund') return false;
      if (assetFilter === 'fund' && t.assetType !== 'fund') return false;

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = t.stockName.toLowerCase().includes(q);
        const matchCode = t.stockCode.toLowerCase().includes(q);
        const matchAccount = t.account.toLowerCase().includes(q);
        const matchNotes = t.notes.toLowerCase().includes(q);
        const matchDate = t.tradeDate.includes(q);
        return matchName || matchCode || matchAccount || matchNotes || matchDate;
      }

      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.tradeDate).getTime();
      const dateB = new Date(b.tradeDate).getTime();
      if (dateA !== dateB) {
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      }
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  }, [tradesWithNotes, statusFilter, assetFilter, searchQuery, sortOrder]);

  // Grouped trades for rendering
  const groupedData = useMemo(() => {
    if (groupByMode === 'flat') {
      return null;
    }

    if (groupByMode === 'date') {
      const groups: Record<string, TradeRecord[]> = {};
      filteredTrades.forEach(t => {
        const key = t.tradeDate;
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
      });
      return groups;
    }

    if (groupByMode === 'stock') {
      const groups: Record<string, TradeRecord[]> = {};
      filteredTrades.forEach(t => {
        const key = `${t.stockName} (${t.stockCode})`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
      });
      return groups;
    }

    return null;
  }, [filteredTrades, groupByMode]);

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* KPI Top Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div 
          onClick={() => setStatusFilter('pending')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'pending'
              ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-amber-500/50 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/30'
              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-medium flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              未完成待跟进
            </span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-bold">
              需处理
            </span>
          </div>
          <div className="text-2xl font-bold text-amber-400 font-sans">
            {stats.pendingCount} <span className="text-xs text-slate-400 font-normal">项</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">按交易日期排列待办事项</p>
        </div>

        <div 
          onClick={() => { setStatusFilter('pending'); setAssetFilter('stock'); }}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'pending' && assetFilter === 'stock'
              ? 'bg-slate-800/90 border-emerald-500/50 shadow-lg ring-1 ring-emerald-500/30'
              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-medium flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-cyan-400" />
              股票未完成
            </span>
            <span className="text-[10px] text-slate-400">Stock</span>
          </div>
          <div className="text-2xl font-bold text-cyan-300 font-sans">
            {stats.pendingStockCount} <span className="text-xs text-slate-400 font-normal">项</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">包含股票交易挂单/补仓计划</p>
        </div>

        <div 
          onClick={() => { setStatusFilter('pending'); setAssetFilter('fund'); }}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'pending' && assetFilter === 'fund'
              ? 'bg-slate-800/90 border-purple-500/50 shadow-lg ring-1 ring-purple-500/30'
              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-medium flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-purple-400" />
              基金未完成
            </span>
            <span className="text-[10px] text-slate-400">Fund / ETF</span>
          </div>
          <div className="text-2xl font-bold text-purple-300 font-sans">
            {stats.pendingFundCount} <span className="text-xs text-slate-400 font-normal">项</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">包含支付宝/场外基金净值与定投</p>
        </div>

        <div 
          onClick={() => setStatusFilter('completed')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'completed'
              ? 'bg-slate-800/90 border-emerald-500/50 shadow-lg ring-1 ring-emerald-500/30'
              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              已完成归档
            </span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 font-bold">
              Done
            </span>
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-sans">
            {stats.completedCount} <span className="text-xs text-slate-400 font-normal">项</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">备注计划已执行完成</p>
        </div>
      </div>

      {/* Toolbar / Search & Filter Controls */}
      <div className="bg-slate-900/90 p-3 sm:p-4 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setStatusFilter('pending')}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                statusFilter === 'pending'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>未完成待办</span>
              <span className={`px-1.5 py-0.2 text-[10px] rounded-full ${
                statusFilter === 'pending' ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}>
                {stats.pendingCount}
              </span>
            </button>

            <button
              onClick={() => setStatusFilter('all')}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                statusFilter === 'all'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>全部备注</span>
              <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-800 text-slate-300">
                {stats.totalWithNotes}
              </span>
            </button>

            <button
              onClick={() => setStatusFilter('completed')}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                statusFilter === 'completed'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>已完成归档</span>
              <span className={`px-1.5 py-0.2 text-[10px] rounded-full ${
                statusFilter === 'completed' ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}>
                {stats.completedCount}
              </span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索股票/基金代码、名称、账户或备注关键词..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Secondary Filter Row: Asset Type, Grouping & Sort Direction */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              <span>标的类别:</span>
            </span>
            <div className="inline-flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
              <button
                onClick={() => setAssetFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  assetFilter === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setAssetFilter('stock')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  assetFilter === 'stock' ? 'bg-slate-800 text-cyan-300 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                股票
              </button>
              <button
                onClick={() => setAssetFilter('fund')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  assetFilter === 'fund' ? 'bg-slate-800 text-purple-300 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                基金 / ETF
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Grouping mode */}
            <div className="flex items-center space-x-1">
              <span className="text-slate-400 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" />
                <span>视图分组:</span>
              </span>
              <div className="inline-flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                <button
                  onClick={() => setGroupByMode('date')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    groupByMode === 'date' ? 'bg-slate-800 text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  按交易日期
                </button>
                <button
                  onClick={() => setGroupByMode('stock')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    groupByMode === 'stock' ? 'bg-slate-800 text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  按股票/基金
                </button>
                <button
                  onClick={() => setGroupByMode('flat')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    groupByMode === 'flat' ? 'bg-slate-800 text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  平铺长列表
                </button>
              </div>
            </div>

            {/* Sort direction */}
            <button
              onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              className="flex items-center space-x-1 px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 transition-all"
              title="切换交易日期排序（最新/最早）"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" />
              <span>{sortOrder === 'desc' ? '最新交易日优先' : '最早交易日优先'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Task Cards Content Area */}
      {filteredTrades.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-slate-800/80 border border-slate-700/80 flex items-center justify-center mx-auto text-emerald-400">
            {statusFilter === 'pending' ? <CheckCircle2 className="w-8 h-8" /> : <ClipboardList className="w-8 h-8 text-slate-500" />}
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">
              {statusFilter === 'pending' ? '🎉 太棒了！暂无未完成的跟进任务' : '没有符合筛选条件的备注记录'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {statusFilter === 'pending'
                ? '您所有的股票与基金交易备注均已处理完成。您可以在记一笔或修改交易时，添加更多买卖挂单计划。'
                : '可以尝试清空搜索关键词或切换顶部的“待办/全量/完成”筛选标签。'}
            </p>
          </div>
          <button
            onClick={onAddNewTrade}
            className="inline-flex items-center space-x-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md"
          >
            <PlusCircle className="w-4 h-4" />
            <span>记一笔新交易 / 添加备注</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Render Grouped View */}
          {groupedData ? (
            (Object.entries(groupedData) as [string, TradeRecord[]][]).map(([groupTitle, items]) => (
              <div key={groupTitle} className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                {/* Group Header */}
                <div className="bg-slate-950/80 px-4 py-2.5 border-b border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {groupByMode === 'date' ? (
                      <Calendar className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Tag className="w-4 h-4 text-cyan-400" />
                    )}
                    <span className="font-bold text-sm text-slate-200">{groupTitle}</span>
                  </div>
                  <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-medium">
                    {items.length} 项任务
                  </span>
                </div>

                {/* Group Items */}
                <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map(trade => (
                    <TaskCard 
                      key={trade.id} 
                      trade={trade} 
                      onEditTrade={onEditTrade} 
                      onSetNoteStatus={onSetNoteStatus} 
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            /* Flat List View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredTrades.map(trade => (
                <TaskCard 
                  key={trade.id} 
                  trade={trade} 
                  onEditTrade={onEditTrade} 
                  onSetNoteStatus={onSetNoteStatus} 
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* Individual Task Card Component */
interface TaskCardProps {
  trade: TradeRecord;
  onEditTrade: (trade: TradeRecord) => void;
  onSetNoteStatus: (tradeId: string, status: 'pending' | 'completed' | 'none') => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ trade, onEditTrade, onSetNoteStatus }) => {
  const status = trade.notesStatus || (trade.notesCompleted ? 'completed' : 'none');
  const isCompleted = status === 'completed';
  const isPending = status === 'pending';

  return (
    <div className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${
      isCompleted
        ? 'bg-slate-950/60 border-emerald-500/30'
        : isPending
        ? 'bg-slate-900 border-amber-500/40 shadow-md shadow-amber-500/5'
        : 'bg-slate-900 border-slate-800'
    }`}>
      <div className="space-y-2">
        {/* Header: Trade Date, Asset Tag, Stock Name & Code */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold text-slate-100">{trade.stockName}</span>
              <span className="text-[10px] text-slate-400 font-mono">({trade.stockCode})</span>
              <span className={`text-[9px] px-1.5 py-0.2 rounded font-medium border ${
                trade.assetType === 'fund'
                  ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                  : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
              }`}>
                {trade.assetType === 'fund' ? '基金' : '股票'}
              </span>
            </div>
            <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
              <span className="font-mono">{trade.tradeDate}</span>
              <span>•</span>
              <span className="truncate max-w-[100px]">{trade.account}</span>
            </div>
          </div>

          {/* Trade Action Badge */}
          <span className={`px-2 py-0.5 text-xs font-bold rounded-lg border flex-shrink-0 flex items-center gap-1 ${
            trade.tradeAction === 'buy'
              ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
              : trade.tradeAction === 'sell'
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              : 'bg-purple-500/15 text-purple-400 border-purple-500/30'
          }`}>
            {trade.tradeAction === 'buy' ? '买入' : trade.tradeAction === 'sell' ? '卖出' : '分红'}
            <span className="text-[11px] font-mono font-normal">
              ¥{trade.price.toFixed(trade.assetType === 'fund' ? 3 : 2)}
            </span>
          </span>
        </div>

        {/* Note Text Box with Status Color Coding */}
        <div className={`p-2.5 rounded-xl border text-xs font-medium leading-relaxed break-words whitespace-pre-wrap ${
          isCompleted
            ? 'bg-emerald-950/20 text-emerald-300 border-emerald-500/30'
            : isPending
            ? 'bg-amber-950/20 text-amber-300 border-amber-500/40 shadow-inner'
            : 'bg-slate-950 text-white border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-1 text-[10px] text-slate-400 border-b border-slate-800/60 pb-1">
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              <span>跟进计划与备注:</span>
            </span>
            <span className={`font-bold ${
              isCompleted ? 'text-emerald-400' : isPending ? 'text-amber-400' : 'text-slate-400'
            }`}>
              {isCompleted ? '✓ 已完成' : isPending ? '⏳ 未完成跟进' : '⚪ 普通备注'}
            </span>
          </div>
          <div>{trade.notes}</div>
        </div>
      </div>

      {/* Footer Controls: Quick Action Buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSetNoteStatus(trade.id, isPending ? 'none' : 'pending')}
            className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition-all ${
              isPending
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-amber-300 hover:border-amber-500/40'
            }`}
          >
            未完成
          </button>

          <button
            type="button"
            onClick={() => onSetNoteStatus(trade.id, isCompleted ? 'none' : 'completed')}
            className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition-all ${
              isCompleted
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-emerald-300 hover:border-emerald-500/40'
            }`}
          >
            完成
          </button>
        </div>

        <button
          type="button"
          onClick={() => onEditTrade(trade)}
          className="flex items-center space-x-1 px-2.5 py-1 text-xs rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all"
        >
          <Edit3 className="w-3 h-3 text-emerald-400" />
          <span>修改/调整</span>
        </button>
      </div>
    </div>
  );
};
