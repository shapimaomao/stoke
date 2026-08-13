import React from 'react';
import { Layers, Check, PlusCircle, Building, Search, X, Grid } from 'lucide-react';
import { TradeRecord, StrategyType, GridStrategyConfig } from '../types';
import { GridStrategyCard } from './GridStrategyCard';

interface StockQuickSelectorProps {
  trades: TradeRecord[];
  selectedStockCode: string | null;
  onSelectStock: (code: string | null) => void;
  onQuickAddForStock: (stock: {
    stockCode: string;
    stockName: string;
    account: string;
    strategyName: string;
    strategyType: StrategyType;
  }) => void;
  gridConfigs?: GridStrategyConfig[];
  onSaveGridConfig?: (config: GridStrategyConfig) => void;
  onDeleteGridConfig?: (stockCode: string) => void;
}

export const StockQuickSelector: React.FC<StockQuickSelectorProps> = ({
  trades,
  selectedStockCode,
  onSelectStock,
  onQuickAddForStock,
  gridConfigs = [],
  onSaveGridConfig,
  onDeleteGridConfig,
}) => {
  // Aggregate unique stocks and their latest metadata & position status
  const stockMap = new Map<string, {
    stockCode: string;
    stockName: string;
    account: string;
    strategyName: string;
    strategyType: StrategyType;
    tradeCount: number;
    currentQuantity: number;
    lastTradeDate: string;
  }>();

  // Iterate over trades (sorted by date descending if possible)
  trades.forEach(t => {
    if (!t.stockCode) return;
    const existing = stockMap.get(t.stockCode);
    const qtyChange = t.tradeAction === 'buy' ? t.quantity : -t.quantity;

    if (!existing) {
      stockMap.set(t.stockCode, {
        stockCode: t.stockCode,
        stockName: t.stockName,
        account: t.account,
        strategyName: t.strategyName,
        strategyType: t.strategyType,
        tradeCount: 1,
        currentQuantity: qtyChange,
        lastTradeDate: t.tradeDate,
      });
    } else {
      existing.tradeCount += 1;
      existing.currentQuantity += qtyChange;
      // keep latest trade metadata for auto-matching
      if (new Date(t.tradeDate).getTime() > new Date(existing.lastTradeDate).getTime()) {
        existing.stockName = t.stockName;
        existing.account = t.account;
        existing.strategyName = t.strategyName;
        existing.strategyType = t.strategyType;
        existing.lastTradeDate = t.tradeDate;
      }
    }
  });

  const uniqueStocks = Array.from(stockMap.values()).sort((a, b) => b.tradeCount - a.tradeCount);

  if (uniqueStocks.length === 0) {
    return null;
  }

  const selectedStockObj = selectedStockCode ? stockMap.get(selectedStockCode) : null;
  const currentGridConfig = selectedStockCode
    ? gridConfigs.find(c => c.stockCode === selectedStockCode) || null
    : null;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-slate-200">标的对账快捷过滤 (共 {uniqueStocks.length} 只股票)</span>
          {selectedStockCode && (
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1">
              当前看: {selectedStockObj?.stockName || selectedStockCode}
              <button 
                onClick={() => onSelectStock(null)} 
                className="hover:text-white ml-0.5"
                title="清除过滤"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>

        {selectedStockCode && selectedStockObj && (
          <button
            onClick={() => onQuickAddForStock(selectedStockObj)}
            className="flex items-center space-x-1 px-3 py-1 bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-bold rounded-xl text-[11px] shadow-sm transition-all active:scale-95"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>为 {selectedStockObj.stockName} 新增一笔成交</span>
          </button>
        )}
      </div>

      {/* Stock Cards / Pills Multi-Row Grid Layout */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {/* All Stocks Option */}
        <button
          onClick={() => onSelectStock(null)}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
            selectedStockCode === null
              ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md scale-[1.02]'
              : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
          }`}
        >
          <span>全部标的</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
            selectedStockCode === null ? 'bg-slate-950/20 text-slate-950 font-extrabold' : 'bg-slate-800 text-slate-400'
          }`}>
            {trades.length} 笔
          </span>
        </button>

        {/* Stock Items */}
        {uniqueStocks.map(s => {
          const isSelected = selectedStockCode === s.stockCode;
          const isHolding = s.currentQuantity > 0;
          const isGrid = s.strategyName.includes('网格') || gridConfigs.some(c => c.stockCode === s.stockCode);

          return (
            <div
              key={s.stockCode}
              className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-xl text-xs transition-all border cursor-pointer group ${
                isSelected
                  ? 'bg-slate-800 border-emerald-500 text-slate-100 shadow-md ring-1 ring-emerald-500/50'
                  : 'bg-slate-950 border-slate-800 hover:border-slate-700 hover:text-slate-300'
              }`}
              onClick={() => onSelectStock(s.stockCode)}
            >
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="font-bold text-slate-100">{s.stockName}</span>
                  <span className="text-[10px] font-mono text-slate-400">{s.stockCode}</span>
                  {isHolding && (
                    <span className="px-1 py-0.2 text-[9px] bg-rose-500/20 text-rose-300 rounded font-mono">
                      持仓 {s.currentQuantity.toLocaleString()}
                    </span>
                  )}
                  {isGrid && (
                    <span className="px-1 py-0.2 text-[9px] bg-amber-500/20 text-amber-300 rounded font-sans font-medium">
                      网格
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center space-x-1.5 mt-0.5 font-mono">
                  <span>{s.account}</span>
                  <span>•</span>
                  <span>{s.strategyName}</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-semibold">{s.tradeCount}笔对账</span>
                </div>
              </div>

              {/* Quick Add Button per stock */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickAddForStock(s);
                }}
                className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-all ml-0.5"
                title={`快速为 ${s.stockName} 增加成交明细`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Embedded Customized Grid Strategy Card when a Stock is Selected */}
      {selectedStockCode && selectedStockObj && onSaveGridConfig && (
        <div className="pt-2">
          <GridStrategyCard
            stockCode={selectedStockObj.stockCode}
            stockName={selectedStockObj.stockName}
            account={selectedStockObj.account}
            strategyName={selectedStockObj.strategyName}
            config={currentGridConfig}
            onSaveConfig={onSaveGridConfig}
            onDeleteConfig={onDeleteGridConfig}
          />
        </div>
      )}
    </div>
  );
};

