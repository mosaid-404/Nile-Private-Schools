import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  maxHeight?: number;
  overscan?: number;
  resetKey?: string | number;
  className?: string;
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyState?: React.ReactNode;
}

export function VirtualList<T>({
  items,
  itemHeight,
  maxHeight = 240,
  overscan = 6,
  resetKey,
  className = '',
  renderItem,
  emptyState = null
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    setScrollTop(0);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [resetKey]);

  const totalHeight = items.length * itemHeight;
  const maxValidScroll = Math.max(0, totalHeight - maxHeight);
  const effectiveScrollTop = Math.min(scrollTop, maxValidScroll);

  const startIdx = Math.max(0, Math.floor(effectiveScrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(maxHeight / itemHeight) + overscan * 2;
  const endIdx = Math.min(items.length, startIdx + visibleCount);

  const paddingTop = startIdx * itemHeight;
  const paddingBottom = Math.max(0, (items.length - endIdx) * itemHeight);
  const slice = items.slice(startIdx, endIdx);

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      style={{ maxHeight }}
      className={`overflow-y-auto ${className}`}
    >
      {items.length === 0 ? (
        emptyState
      ) : (
        <div style={{ paddingTop, paddingBottom }}>
          {slice.map((item, offset) => renderItem(item, startIdx + offset))}
        </div>
      )}
    </div>
  );
}

export interface VirtualSelectOption {
  value: string;
  label: string;
  subLabel?: string;
  searchText?: string;
}

interface SearchableVirtualSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: VirtualSelectOption[];
  emptyOptionLabel: string;
  searchPlaceholder?: string;
  buttonClassName?: string;
}

export const SearchableVirtualSelect: React.FC<SearchableVirtualSelectProps> = ({
  value,
  onChange,
  options,
  emptyOptionLabel,
  searchPlaceholder = 'اكتب للبحث...',
  buttonClassName = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen]);

  const selectedLabel = useMemo(() => {
    if (!value) return emptyOptionLabel;
    for (let i = 0; i < options.length; i++) {
      if (options[i].value === value) return options[i].label;
    }
    return emptyOptionLabel;
  }, [value, options, emptyOptionLabel]);

  const filteredOptions = useMemo(() => {
    if (!isOpen) return [];
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(opt => {
      const hay = (opt.searchText || `${opt.label} ${opt.subLabel || ''}`).toLowerCase();
      return hay.includes(q);
    });
  }, [isOpen, options, query]);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className={`w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-hidden focus:border-[#1F4E8C] flex items-center justify-between gap-2 text-right ${buttonClassName}`}
      >
        <span className="truncate font-semibold text-slate-800">{selectedLabel}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute right-0 left-0 mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden text-right">
          <div className="p-2 border-b border-slate-100 bg-slate-50/70">
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pr-7 pl-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white outline-hidden focus:border-[#1F4E8C]"
                autoFocus
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2" />
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onChange('');
              setIsOpen(false);
              setQuery('');
            }}
            className={`w-full px-3 py-2 text-xs flex items-center justify-between border-b border-slate-100 hover:bg-blue-50/70 transition text-right ${
              value === '' ? 'bg-blue-50 text-[#1F4E8C] font-bold' : 'text-slate-700 font-semibold'
            }`}
          >
            <span className="truncate">{emptyOptionLabel}</span>
            {value === '' && <Check className="w-3.5 h-3.5 text-[#1F4E8C] shrink-0" />}
          </button>

          <VirtualList
            items={filteredOptions}
            itemHeight={38}
            maxHeight={220}
            resetKey={query}
            emptyState={
              <p className="px-3 py-4 text-center text-xs text-slate-400">
                لا توجد نتائج مطابقة
              </p>
            }
            renderItem={(opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                    setQuery('');
                  }}
                  className={`w-full h-[38px] px-3 text-xs flex items-center justify-between gap-2 hover:bg-blue-50/70 transition text-right border-b border-slate-50 ${
                    isSelected ? 'bg-blue-50 text-[#1F4E8C] font-bold' : 'text-slate-700'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {opt.subLabel && (
                      <span className="text-[10px] text-slate-400 font-mono">{opt.subLabel}</span>
                    )}
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#1F4E8C]" />}
                  </div>
                </button>
              );
            }}
          />
        </div>
      )}
    </div>
  );
};

export function useProgressiveCount(
  totalCount: number,
  initialCount = 80,
  step = 150,
  resetKey?: unknown
) {
  const [visibleCount, setVisibleCount] = useState(initialCount);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(initialCount);
  }, [resetKey, initialCount]);

  useEffect(() => {
    const onBeforePrint = () => {
      setVisibleCount(totalCount);
    };
    window.addEventListener('beforeprint', onBeforePrint);
    return () => window.removeEventListener('beforeprint', onBeforePrint);
  }, [totalCount]);

  useEffect(() => {
    if (visibleCount >= totalCount) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setVisibleCount(prev => Math.min(totalCount, prev + step));
        }
      },
      { rootMargin: '350px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visibleCount, totalCount, step]);

  return {
    visibleCount: Math.min(visibleCount, totalCount),
    hasMore: visibleCount < totalCount,
    sentinelRef
  };
}
