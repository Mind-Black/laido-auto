import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Charger, CalendarBlock } from '../../lib/types';
import {
  DEFAULT_TIMEZONE,
  formatTimeInZone,
  getWeekStart,
} from '../../lib/time';
import { DateTime } from 'luxon';
import { ChevronLeft, ChevronRight, Clock, Zap } from 'lucide-react';

interface Props {
  chargers: Charger[];
  blocks: CalendarBlock[];
  loading?: boolean;
  onRangeChange: (startIso: string, endIso: string) => void;
  onSelectSlot: (chargerId: string, startIso: string, endIso: string) => void;
  onSelectExistingBooking?: (block: CalendarBlock) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 64; // pixels per hour (16px per 15-min slot)

export const CalendarView: React.FC<Props> = ({
  chargers,
  blocks,
  loading = false,
  onRangeChange,
  onSelectSlot,
  onSelectExistingBooking,
}) => {
  const [viewMode, setViewMode] = useState<'day' | 'week'>(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches ? 'day' : 'week'
  );
  const [selectedChargerId, setSelectedChargerId] = useState<string>(chargers[0]?.id || '');
  const selectedChargerEnabled = chargers.some((charger) => charger.id === selectedChargerId && charger.enabled);
  const [currentDate, setCurrentDate] = useState<DateTime>(DateTime.now().setZone(DEFAULT_TIMEZONE));
  
  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartSlot, setDragStartSlot] = useState<{ dayStr: string; minute: number; chargerId: string } | null>(null);
  const [dragEndSlot, setDragEndSlot] = useState<{ dayStr: string; minute: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync selected charger
  useEffect(() => {
    if (chargers.length > 0 && !chargers.some((charger) => charger.id === selectedChargerId)) {
      setSelectedChargerId(chargers[0].id);
    }
  }, [chargers, selectedChargerId]);

  // Put the next available hours in view on first open.
  useEffect(() => {
    if (containerRef.current) {
      const hour = DateTime.now().setZone(DEFAULT_TIMEZONE).hour;
      containerRef.current.scrollTop = Math.max(0, Math.min(21, hour - 1)) * HOUR_HEIGHT;
    }
  }, []);

  // Compute displayed days
  const weekStart = useMemo(() => getWeekStart(currentDate, DEFAULT_TIMEZONE), [currentDate]);

  const daysToRender = useMemo(() => {
    if (viewMode === 'day') {
      return [currentDate.startOf('day')];
    }
    // Week view: 7 days Mon-Sun
    return Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i }));
  }, [viewMode, currentDate, weekStart]);

  const rangeStart = (viewMode === 'day' ? currentDate.startOf('day').minus({ days: 1 }) : weekStart.minus({ weeks: 1 })).toUTC().toISO()!;
  const rangeEnd = (viewMode === 'day' ? currentDate.startOf('day').plus({ days: 2 }) : weekStart.plus({ weeks: 2 })).toUTC().toISO()!;
  useEffect(() => onRangeChange(rangeStart, rangeEnd), [onRangeChange, rangeStart, rangeEnd]);

  // Header display string
  const dateRangeLabel = useMemo(() => {
    if (viewMode === 'day') {
      return currentDate.toFormat('cccc, d MMMM yyyy');
    }
    const weekEnd = weekStart.plus({ days: 6 });
    return `${weekStart.toFormat('d LLL')} – ${weekEnd.toFormat('d LLL yyyy')}`;
  }, [viewMode, currentDate, weekStart]);

  // Navigation handlers
  const handlePrev = () => {
    setCurrentDate((d) => (viewMode === 'day' ? d.minus({ days: 1 }) : d.minus({ weeks: 1 })));
  };

  const handleNext = () => {
    setCurrentDate((d) => (viewMode === 'day' ? d.plus({ days: 1 }) : d.plus({ weeks: 1 })));
  };

  const handleToday = () => {
    setCurrentDate(DateTime.now().setZone(DEFAULT_TIMEZONE));
    if (containerRef.current) {
      const hour = DateTime.now().setZone(DEFAULT_TIMEZONE).hour;
      containerRef.current.scrollTop = Math.max(0, Math.min(21, hour - 1)) * HOUR_HEIGHT;
    }
  };

  // Drag interaction handlers
  const handlePointerDown = (dayStr: string, hour: number, quarter: number, chargerId: string) => {
    const minute = hour * 60 + quarter * 15;
    setIsDragging(true);
    setDragStartSlot({ dayStr, minute, chargerId });
    setDragEndSlot({ dayStr, minute: minute + 30 }); // default 30 min min
  };

  const handlePointerEnter = (dayStr: string, hour: number, quarter: number) => {
    if (!isDragging || !dragStartSlot) return;
    if (dragStartSlot.dayStr !== dayStr) return; // Keep same date

    const minute = hour * 60 + quarter * 15;
    // ensure end is at least 30m after start if dragging forward, or clamp
    setDragEndSlot({ dayStr, minute: minute + 15 });
  };

  const handlePointerUp = useCallback(() => {
    if (!isDragging || !dragStartSlot || !dragEndSlot) {
      setIsDragging(false);
      setDragStartSlot(null);
      setDragEndSlot(null);
      return;
    }

    const minSlot = Math.min(dragStartSlot.minute, dragEndSlot.minute);
    let maxSlot = Math.max(dragStartSlot.minute, dragEndSlot.minute);

    // Enforce 30m minimum
    if (maxSlot - minSlot < 30) {
      maxSlot = minSlot + 30;
    }

    const startDt = DateTime.fromISO(dragStartSlot.dayStr, { zone: DEFAULT_TIMEZONE })
      .startOf('day')
      .plus({ minutes: minSlot });
    const endDt = DateTime.fromISO(dragStartSlot.dayStr, { zone: DEFAULT_TIMEZONE })
      .startOf('day')
      .plus({ minutes: maxSlot });

    setIsDragging(false);
    setDragStartSlot(null);
    setDragEndSlot(null);

    onSelectSlot(dragStartSlot.chargerId, startDt.toUTC().toISO()!, endDt.toUTC().toISO()!);
  }, [isDragging, dragStartSlot, dragEndSlot, onSelectSlot]);

  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUp);
    const cancelDrag = () => {
      setIsDragging(false);
      setDragStartSlot(null);
      setDragEndSlot(null);
    };
    window.addEventListener('pointercancel', cancelDrag);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', cancelDrag);
    };
  }, [handlePointerUp]);

  // Current time position (minutes from midnight)
  const now = DateTime.now().setZone(DEFAULT_TIMEZONE);
  const isTodayDisplayed = daysToRender.some((d) => d.hasSame(now, 'day'));
  const currentMinutesFromMidnight = now.hour * 60 + now.minute;
  const currentTimeTop = (currentMinutesFromMidnight / 60) * HOUR_HEIGHT;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[min(750px,80dvh)] min-h-[480px]">
      {/* Control bar */}
      <div className="p-3 sm:p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
        {/* Navigation */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shadow-xs">
            <button
              onClick={handlePrev}
              className="flex h-11 w-11 items-center justify-center hover:bg-slate-100 text-slate-600 transition-colors"
              aria-label="Previous period"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleToday}
              className="h-11 px-3 text-xs font-semibold hover:bg-slate-100 text-slate-700 border-x border-slate-200 transition-colors"
            >
              Today
            </button>
            <button
              onClick={handleNext}
              className="flex h-11 w-11 items-center justify-center hover:bg-slate-100 text-slate-600 transition-colors"
              aria-label="Next period"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <span className="min-w-0 text-sm font-semibold text-slate-800 sm:ml-1">
            {dateRangeLabel}
          </span>
        </div>

        {/* View and Charger controls */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-3">
          {/* Day / Week Switcher */}
          <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg text-xs font-semibold text-slate-700">
            <button
              onClick={() => setViewMode('day')}
              aria-pressed={viewMode === 'day'}
              className={`min-h-11 px-4 rounded-md transition-all ${
                viewMode === 'day' ? 'bg-white shadow-xs text-blue-600' : 'hover:text-slate-900'
              }`}
            >
              Day
            </button>
            <button
              onClick={() => setViewMode('week')}
              aria-pressed={viewMode === 'week'}
              className={`min-h-11 px-4 rounded-md transition-all ${
                viewMode === 'week' ? 'bg-white shadow-xs text-blue-600' : 'hover:text-slate-900'
              }`}
            >
              Week
            </button>
          </div>

          {/* On phones, show one roomy charger column at a time in Day view. */}
          {(viewMode === 'week' || chargers.length > 1) && (
            <div className={`${viewMode === 'day' ? 'sm:hidden ' : ''}flex w-full min-w-0 items-center rounded-lg bg-slate-200/80 p-0.5 text-xs font-semibold text-slate-700 sm:w-auto`}>
              {chargers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedChargerId(c.id)}
                  aria-pressed={selectedChargerId === c.id}
                  className={`min-h-11 min-w-0 flex-1 truncate px-2 rounded-md transition-all sm:flex-none sm:px-3 ${
                    selectedChargerId === c.id ? 'bg-white shadow-xs text-blue-600' : 'hover:text-slate-900'
                  }`}
                >
                  {c.display_name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Allowance Window Banner */}
      <div className="px-3 sm:px-4 py-1.5 bg-blue-50/50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 inline-block w-2.5 h-2.5 shrink-0 bg-blue-100 border border-blue-300 rounded-xs"></span>
          <span>Shaded window: Monday–Friday 08:00–17:00 (counts toward 4h daily / 12h weekly allowance)</span>
        </div>
        <span className="font-mono text-slate-500" role="status">{loading ? 'Updating availability…' : `All times in ${DEFAULT_TIMEZONE}`}</span>
      </div>

      {/* Calendar Grid Container */}
      <div ref={containerRef} className="flex-1 overflow-auto relative select-none">
        <div className={`${viewMode === 'week' ? 'min-w-[650px]' : 'min-w-0'} flex flex-col`}>
          {/* Day / Charger Headers */}
          <div className="sticky top-0 z-20 flex bg-white border-b border-slate-200 shadow-xs">
            {/* Time column header */}
            <div className="w-16 shrink-0 p-2 text-center text-xs font-medium text-slate-400 border-r border-slate-200">
              <Clock className="w-4 h-4 mx-auto" />
            </div>

            {/* Columns headers */}
            {viewMode === 'day' ? (
              // Day View: show both chargers side by side
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2">
                {chargers.map((c) => (
                  <div
                    key={c.id}
                    className={`${c.id !== selectedChargerId ? 'hidden sm:block ' : ''}min-w-0 p-2 text-center text-xs font-semibold text-slate-700 border-r border-slate-200 last:border-r-0 bg-slate-50/80`}
                  >
                    <span>{c.display_name}</span>
                    {!c.enabled && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-rose-100 text-rose-700 font-normal">
                        Maintenance
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              // Week View: 7 day columns
              <div className="flex-1 grid grid-cols-7">
                {daysToRender.map((day) => {
                  const isToday = day.hasSame(now, 'day');
                  const isWeekday = day.weekday >= 1 && day.weekday <= 5;
                  return (
                    <div
                      key={day.toISO()}
                      className={`p-2 text-center border-r border-slate-200 last:border-r-0 ${
                        isToday ? 'bg-blue-50/80 font-bold text-blue-700' : 'bg-slate-50/60'
                      }`}
                    >
                      <div className="text-[11px] uppercase tracking-wider text-slate-500">
                        {day.toFormat('ccc')}
                      </div>
                      <div className={`text-sm ${isToday ? 'text-blue-700' : 'text-slate-800'}`}>
                        {day.toFormat('d LLL')}
                      </div>
                      {isWeekday && (
                        <div className="text-[9px] text-blue-500 font-normal">08–17 window</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Time Grid Body */}
          <div className="relative flex">
            {/* Time Labels Column */}
            <div className="w-16 shrink-0 border-r border-slate-200 bg-white">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="h-16 text-right pr-2 text-xs font-mono text-slate-400 relative -top-2.5"
                >
                  {`${hour.toString().padStart(2, '0')}:00`}
                </div>
              ))}
            </div>

            {/* Grid Columns */}
            {viewMode === 'day' ? (
              // Day View: 2 columns for Charger 1 and Charger 2
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 relative">
                {chargers.map((c) => {
                  const dayDt = daysToRender[0];
                  const dayStr = dayDt.toISODate()!;
                  const isWeekday = dayDt.weekday >= 1 && dayDt.weekday <= 5;
                  const isPastDay = dayDt < now.startOf('day');
                  const isToday = dayDt.hasSame(now, 'day');

                  // Filter blocks for this charger and day
                  const chargerBlocks = blocks.filter((b) => {
                    if (b.charger_id !== c.id) return false;
                    const bStart = DateTime.fromISO(b.start_time, { zone: DEFAULT_TIMEZONE });
                    const bEnd = DateTime.fromISO(b.effective_end_time, { zone: DEFAULT_TIMEZONE });
                    return bStart < dayDt.endOf('day') && bEnd > dayDt.startOf('day');
                  });

                  return (
                    <div
                      key={c.id}
                      className={`${c.id !== selectedChargerId ? 'hidden sm:block ' : ''}border-r border-slate-200 last:border-r-0 relative ${!c.enabled ? 'bg-maintenance-stripes' : ''}`}
                    >
                      {/* Weekday 08:00 - 17:00 allowance background shading */}
                      {isWeekday && (
                        <div
                          className="absolute inset-x-0 bg-allowance-window border-y border-blue-200/50 pointer-events-none"
                          style={{
                            top: `${8 * HOUR_HEIGHT}px`,
                            height: `${9 * HOUR_HEIGHT}px`,
                          }}
                        />
                      )}

                      {/* 24 Hour Slots */}
                      {HOURS.map((hour) => (
                        <div key={hour} className="h-16 border-b border-slate-100 flex flex-col">
                          {[0, 1, 2, 3].map((quarter) => (
                            <div
                              key={quarter}
                              onPointerDown={c.enabled && !loading && !isPastDay && !(isToday && hour * 60 + quarter * 15 <= now.hour * 60 + now.minute) ? () => handlePointerDown(dayStr, hour, quarter, c.id) : undefined}
                              onPointerEnter={c.enabled ? () => handlePointerEnter(dayStr, hour, quarter) : undefined}
                              className={`h-4 ${c.enabled && !loading && !isPastDay && !(isToday && hour * 60 + quarter * 15 <= now.hour * 60 + now.minute) ? 'hover:bg-blue-50/40 cursor-pointer' : 'cursor-not-allowed'}`}
                            />
                          ))}
                        </div>
                      ))}

                      {/* Render Reservation Blocks */}
                      {chargerBlocks.map((b) => (
                        <RenderBookingBlock
                          key={b.id || `${b.charger_id}-${b.start_time}`}
                          block={b}
                          dayDt={dayDt}
                          onClick={() => onSelectExistingBooking?.(b)}
                        />
                      ))}

                      {/* Render Current Drag Selection */}
                      {isDragging && dragStartSlot && dragEndSlot && dragStartSlot.chargerId === c.id && dragStartSlot.dayStr === dayStr && (
                        <RenderDragSelection
                          startMin={Math.min(dragStartSlot.minute, dragEndSlot.minute)}
                          endMin={Math.max(dragStartSlot.minute, dragEndSlot.minute)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              // Week View: 7 columns for the selected charger
              <div className="flex-1 grid grid-cols-7 relative">
                {daysToRender.map((dayDt) => {
                  const dayStr = dayDt.toISODate()!;
                  const isWeekday = dayDt.weekday >= 1 && dayDt.weekday <= 5;
                  const isPastDay = dayDt < now.startOf('day');
                  const isToday = dayDt.hasSame(now, 'day');

                  const colBlocks = blocks.filter((b) => {
                    if (b.charger_id !== selectedChargerId) return false;
                    const bStart = DateTime.fromISO(b.start_time, { zone: DEFAULT_TIMEZONE });
                    const bEnd = DateTime.fromISO(b.effective_end_time, { zone: DEFAULT_TIMEZONE });
                    return bStart < dayDt.endOf('day') && bEnd > dayDt.startOf('day');
                  });

                  return (
                    <div
                      key={dayStr}
                      className={`border-r border-slate-200 last:border-r-0 relative ${!selectedChargerEnabled ? 'bg-maintenance-stripes' : ''}`}
                    >
                      {/* Weekday 08:00 - 17:00 allowance window shading */}
                      {isWeekday && (
                        <div
                          className="absolute inset-x-0 bg-allowance-window border-y border-blue-200/50 pointer-events-none"
                          style={{
                            top: `${8 * HOUR_HEIGHT}px`,
                            height: `${9 * HOUR_HEIGHT}px`,
                          }}
                        />
                      )}

                      {/* 24 Hour Slots */}
                      {HOURS.map((hour) => (
                        <div key={hour} className="h-16 border-b border-slate-100 flex flex-col">
                          {[0, 1, 2, 3].map((quarter) => (
                            <div
                              key={quarter}
                              onPointerDown={selectedChargerEnabled && !loading && !isPastDay && !(isToday && hour * 60 + quarter * 15 <= now.hour * 60 + now.minute) ? () => handlePointerDown(dayStr, hour, quarter, selectedChargerId) : undefined}
                              onPointerEnter={selectedChargerEnabled ? () => handlePointerEnter(dayStr, hour, quarter) : undefined}
                              className={`h-4 ${selectedChargerEnabled && !loading && !isPastDay && !(isToday && hour * 60 + quarter * 15 <= now.hour * 60 + now.minute) ? 'hover:bg-blue-50/40 cursor-pointer' : 'cursor-not-allowed'}`}
                            />
                          ))}
                        </div>
                      ))}

                      {/* Reservation Blocks */}
                      {colBlocks.map((b) => (
                        <RenderBookingBlock
                          key={b.id || `${b.charger_id}-${b.start_time}`}
                          block={b}
                          dayDt={dayDt}
                          onClick={() => onSelectExistingBooking?.(b)}
                        />
                      ))}

                      {/* Drag Selection */}
                      {isDragging && dragStartSlot && dragEndSlot && dragStartSlot.chargerId === selectedChargerId && dragStartSlot.dayStr === dayStr && (
                        <RenderDragSelection
                          startMin={Math.min(dragStartSlot.minute, dragEndSlot.minute)}
                          endMin={Math.max(dragStartSlot.minute, dragEndSlot.minute)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Current Time Horizontal Line (if today is visible) */}
            {isTodayDisplayed && (
              <div
                className="absolute left-16 right-0 border-t-2 border-red-500 z-10 pointer-events-none flex items-center"
                style={{ top: `${currentTimeTop}px` }}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5"></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper component to render an active reservation card
const RenderBookingBlock: React.FC<{
  block: CalendarBlock;
  dayDt: DateTime;
  onClick: () => void;
}> = ({ block, dayDt, onClick }) => {
  const bStart = DateTime.fromISO(block.start_time, { zone: DEFAULT_TIMEZONE });
  const bEnd = DateTime.fromISO(block.effective_end_time, { zone: DEFAULT_TIMEZONE });

  const dayStart = dayDt.startOf('day');
  const dayEnd = dayDt.endOf('day');

  // Clamp to this column day
  const effectiveStart = bStart < dayStart ? dayStart : bStart;
  const effectiveEnd = bEnd > dayEnd ? dayEnd : bEnd;

  const startMinutes = effectiveStart.diff(dayStart, 'minutes').minutes;
  const durationMinutes = effectiveEnd.diff(effectiveStart, 'minutes').minutes;

  const top = (startMinutes / 60) * HOUR_HEIGHT;
  const height = Math.max(20, (durationMinutes / 60) * HOUR_HEIGHT);

  const isCheckedIn = block.status === 'checked_in';
  const isAwaitingCheckIn = block.status === 'reserved' && block.is_own;
  const isReleased = block.status === 'released_no_show';

  let bgClass = 'bg-slate-100 border-slate-300 text-slate-800';
  if (block.is_own) {
    if (isCheckedIn) {
      bgClass = 'bg-emerald-50 border-emerald-400 text-emerald-950 ring-1 ring-emerald-400/50';
    } else if (isAwaitingCheckIn) {
      bgClass = 'bg-amber-50 border-amber-400 text-amber-950 ring-1 ring-amber-400/50';
    } else {
      bgClass = 'bg-blue-50 border-blue-400 text-blue-950';
    }
  } else if (isReleased) {
    bgClass = 'bg-rose-50 border-rose-200 text-rose-700';
  }

  return (
    <button
      type="button"
      disabled={!block.is_own}
      aria-label={block.is_own ? `My booking, ${formatTimeInZone(block.start_time)} to ${formatTimeInZone(block.effective_end_time)}` : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`absolute inset-x-1 rounded-md border p-1 text-xs text-left shadow-xs transition-all overflow-hidden flex flex-col justify-between ${block.is_own ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600' : 'cursor-default'} ${bgClass}`}
      style={{ top: `${top}px`, height: `${height}px` }}
      title={`${formatTimeInZone(block.start_time)} - ${formatTimeInZone(block.effective_end_time)} (${block.status})`}
    >
      <span className="flex items-center justify-between gap-1">
        <span className="font-semibold truncate">
          {block.is_own ? 'My Booking' : 'Reserved'}
        </span>
        {isCheckedIn && <Zap className="w-3 h-3 text-emerald-600 fill-emerald-600 shrink-0" />}
      </span>
      <span className="text-[10px] font-mono opacity-80 truncate">
        {formatTimeInZone(block.start_time)}–{formatTimeInZone(block.effective_end_time)}
      </span>
    </button>
  );
};

// Helper component for live drag selection box
const RenderDragSelection: React.FC<{ startMin: number; endMin: number }> = ({ startMin, endMin }) => {
  const duration = Math.max(30, endMin - startMin);
  const top = (startMin / 60) * HOUR_HEIGHT;
  const height = (duration / 60) * HOUR_HEIGHT;

  return (
    <div
      className="absolute inset-x-1 drag-selection-box rounded-md pointer-events-none z-10 flex items-center justify-center text-xs font-semibold text-blue-800"
      style={{ top: `${top}px`, height: `${height}px` }}
    >
      <span>{duration} min</span>
    </div>
  );
};
