import React, { memo, useState, useEffect, useRef, useCallback } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Filter, X } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types & Internal Components
// ─────────────────────────────────────────────────────────────────────────────

interface TooltipProps {
    children: React.ReactNode;
    content: React.ReactNode;
    disabled?: boolean;
}

const Tooltip: React.FC<TooltipProps> = ({ children, content, disabled = false }) => {
    if (disabled || !content) return <>{children}</>;

    return (
        <div className="sft-tooltip-wrapper">
            {children}
            <div className="sft-tooltip-content">
                {content}
                <div className="sft-tooltip-arrow"></div>
            </div>
        </div>
    );
};

export type SortDirection = "asc" | "desc" | null;

export interface SortState {
    [key: string]: SortDirection;
}

export interface FilterState {
    [key: string]: string;
}

export interface SortableFilterableHeaderProps {
    columnKey: string;
    label: string;
    sortable?: boolean;
    searchable?: boolean;
    tablePrefix?: string;
    sortState: SortState;
    setSortState: React.Dispatch<React.SetStateAction<SortState>>;
    filterState: FilterState;
    setFilterState: React.Dispatch<React.SetStateAction<FilterState>>;
    openPopover: string | null;
    setOpenPopover: React.Dispatch<React.SetStateAction<string | null>>;
    debounceMs?: number;
    alwaysShowActions?: boolean;
    suffix?: React.ReactNode;
    align?: "left" | "center" | "right";
}

// ─────────────────────────────────────────────────────────────────────────────
// LabelWithTooltip — shows Tooltip only when the label text is truncated
// ─────────────────────────────────────────────────────────────────────────────

const LabelWithTooltip: React.FC<{ label: string }> = ({ label }) => {
    const ref = useRef<HTMLSpanElement>(null);
    const [overflowing, setOverflowing] = useState(false);
    const handleMouseEnter = () => {
        if (ref.current) {
            setOverflowing(ref.current.scrollWidth > ref.current.clientWidth);
        }
    };
    return (
        <Tooltip content={label} disabled={!overflowing}>
            <span ref={ref} onMouseEnter={handleMouseEnter} className="sft-truncate-text">
                {label}
            </span>
        </Tooltip>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// SortIcon — module-scope so it isn't recreated (and remounted) on every render
// ─────────────────────────────────────────────────────────────────────────────

const SortIcon: React.FC<{ currentSort: SortDirection }> = ({ currentSort }) => {
    if (currentSort === "asc") return <ArrowUp className="sft-icon active-sort" />;
    if (currentSort === "desc") return <ArrowDown className="sft-icon active-sort" />;
    return <ArrowUpDown className="sft-icon default-sort" />;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const SortableFilterableTableHeader = memo(
    ({
        columnKey,
        label,
        sortable = true,
        searchable = false,
        tablePrefix = "",
        sortState,
        setSortState,
        filterState,
        setFilterState,
        openPopover,
        setOpenPopover,
        debounceMs = 0,
        alwaysShowActions = false,
        suffix,
        align = "left",
    }: SortableFilterableHeaderProps) => {
        const fullKey = tablePrefix ? `${tablePrefix}_${columnKey}` : columnKey;
        const currentSort = sortState[fullKey] ?? null;
        const filterValueFromState = filterState[fullKey] ?? "";
        const hasFilter = filterValueFromState.trim() !== "";
        const isPopoverOpen = openPopover === fullKey;

        const [localFilter, setLocalFilter] = useState(filterValueFromState);
        const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
        const inputRef = useRef<HTMLInputElement>(null);
        const popoverRef = useRef<HTMLDivElement>(null);

        // Keep the input in sync when the external filter value changes (e.g. cleared
        // from outside). React's "adjust state during render" pattern — no effect needed.
        const [prevExternalFilter, setPrevExternalFilter] = useState(filterValueFromState);
        if (filterValueFromState !== prevExternalFilter) {
            setPrevExternalFilter(filterValueFromState);
            setLocalFilter(filterValueFromState);
        }

        useEffect(() => {
            if (!searchable) return;
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                setFilterState((prev) => {
                    const trimmed = localFilter.trim();
                    if (trimmed) {
                        if (prev[fullKey] === trimmed) return prev;
                        return { ...prev, [fullKey]: trimmed };
                    } else {
                        if (!(fullKey in prev)) return prev;
                        const next = { ...prev };
                        delete next[fullKey];
                        return next;
                    }
                });
            }, debounceMs);
            return () => {
                if (debounceRef.current) clearTimeout(debounceRef.current);
            };
        }, [localFilter, fullKey, searchable, setFilterState, debounceMs]);

        useEffect(() => {
            if (isPopoverOpen && inputRef.current) {
                setTimeout(() => inputRef.current?.focus(), 50);
            }
        }, [isPopoverOpen]);

        useEffect(() => {
            if (!isPopoverOpen) return;
            const handleClick = (e: MouseEvent) => {
                if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                    setOpenPopover(null);
                }
            };
            document.addEventListener("mousedown", handleClick);
            return () => document.removeEventListener("mousedown", handleClick);
        }, [isPopoverOpen, setOpenPopover]);

        const handleSort = useCallback(() => {
            if (!sortable) return;
            setSortState((prev) => {
                const current = prev[fullKey] ?? null;
                const next: SortDirection =
                    current === null ? "asc" : current === "asc" ? "desc" : null;

                const updated: SortState = {};
                for (const key of Object.keys(prev)) {
                    const belongsToThisTable = tablePrefix
                        ? key.startsWith(tablePrefix + "_")
                        : true;
                    if (!belongsToThisTable) updated[key] = prev[key];
                }
                if (next !== null) updated[fullKey] = next;
                return updated;
            });
        }, [sortable, fullKey, tablePrefix, setSortState]);

        const clearFilter = useCallback(() => {
            setLocalFilter("");
            setFilterState((prev) => {
                const next = { ...prev };
                delete next[fullKey];
                return next;
            });
            setOpenPopover(null);
        }, [fullKey, setFilterState, setOpenPopover]);

        const togglePopover = useCallback(
            (e: React.MouseEvent) => {
                e.stopPropagation();
                setOpenPopover((prev) => (prev === fullKey ? null : fullKey));
            },
            [fullKey, setOpenPopover]
        );

        const isActive = currentSort !== null || hasFilter || isPopoverOpen;
        const actionsClass = alwaysShowActions || isActive ? "sft-actions-visible" : "";
        const justifyClass = align === "center" ? "sft-justify-center" : align === "right" ? "sft-justify-end" : "sft-justify-start";

        return (
            <>
                {/* Embedded CSS for portability */}
                <style dangerouslySetInnerHTML={{ __html: `
                    .sft-container {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        min-width: 0;
                        user-select: none;
                    }
                    .sft-justify-start { justify-content: flex-start; }
                    .sft-justify-center { justify-content: center; }
                    .sft-justify-end { justify-content: flex-end; }
                    
                    .sft-truncate-text {
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        max-width: 100%;
                    }

                    .sft-actions-group {
                        display: flex;
                        align-items: center;
                        gap: 2px;
                        flex-shrink: 0;
                        opacity: 0;
                        transition: opacity 0.15s ease-in-out;
                    }
                    .sft-container:hover .sft-actions-group,
                    .sft-actions-visible {
                        opacity: 1;
                    }

                    .sft-icon-btn {
                        padding: 4px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 6px;
                        background: transparent;
                        border: none;
                        cursor: pointer;
                        color: #94a3b8;
                        transition: all 0.2s;
                    }
                    .sft-icon-btn:hover {
                        background-color: rgba(226, 232, 240, 0.8);
                        color: #475569;
                    }
                    .sft-icon-btn.has-filter {
                        color: #E31E24;
                    }
                    .sft-icon {
                        width: 14px;
                        height: 14px;
                        flex-shrink: 0;
                    }
                    .active-sort { color: #E31E24; }
                    .default-sort { color: inherit; }

                    .sft-popover-wrapper {
                        position: relative;
                        display: flex;
                        align-items: center;
                    }
                    .sft-popover {
                        position: absolute;
                        top: calc(100% + 8px);
                        left: 0;
                        width: 220px;
                        background-color: #ffffff;
                        border: 1px solid #e2e8f0;
                        border-radius: 12px;
                        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                        padding: 12px;
                        z-index: 9999;
                        animation: sft-slide-down 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                        cursor: default;
                    }
                    @keyframes sft-slide-down {
                        from { opacity: 0; transform: translateY(-8px); }
                        to { opacity: 1; transform: translateY(0); }
                    }

                    .sft-popover-title {
                        font-size: 10px;
                        font-weight: 800;
                        color: #64748b;
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                        margin: 0 0 8px 0;
                    }
                    .sft-popover-input-group {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    }
                    .sft-input-wrapper {
                        position: relative;
                        flex: 1;
                    }
                    .sft-input-icon {
                        position: absolute;
                        left: 10px;
                        top: 50%;
                        transform: translateY(-50%);
                        color: #94a3b8;
                        width: 14px;
                        height: 14px;
                    }
                    .sft-input {
                        width: 100%;
                        background-color: #f8fafc;
                        border: 1px solid #e2e8f0;
                        border-radius: 8px;
                        padding: 6px 8px 6px 30px;
                        font-size: 13px;
                        font-weight: 500;
                        color: #334155;
                        outline: none;
                        transition: all 0.2s;
                        box-sizing: border-box;
                    }
                    .sft-input:focus {
                        background-color: #ffffff;
                        border-color: #E31E24;
                        box-shadow: 0 0 0 2px rgba(227, 30, 36, 0.1);
                    }
                    .sft-clear-btn {
                        padding: 6px;
                        border-radius: 6px;
                        background: transparent;
                        border: none;
                        color: #94a3b8;
                        cursor: pointer;
                        transition: all 0.2s;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                    }
                    .sft-clear-btn:hover {
                        background-color: #fef2f2;
                        color: #E31E24;
                    }

                    .sft-tooltip-wrapper {
                        position: relative;
                        display: inline-block;
                    }
                    .sft-tooltip-content {
                        position: absolute;
                        bottom: 100%;
                        left: 50%;
                        transform: translateX(-50%);
                        margin-bottom: 8px;
                        padding: 6px 10px;
                        background-color: #1e293b;
                        color: #ffffff;
                        font-size: 12px;
                        font-weight: 500;
                        border-radius: 6px;
                        opacity: 0;
                        visibility: hidden;
                        transition: all 0.2s ease-in-out;
                        white-space: nowrap;
                        z-index: 10000;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
                        pointer-events: none;
                    }
                    .sft-tooltip-wrapper:hover .sft-tooltip-content {
                        opacity: 1;
                        visibility: visible;
                    }
                    .sft-tooltip-arrow {
                        position: absolute;
                        top: 100%;
                        left: 50%;
                        transform: translateX(-50%);
                        border: 4px solid transparent;
                        border-top-color: #1e293b;
                    }
                `}} />

                <div className={`sft-container ${justifyClass}`}>
                    <LabelWithTooltip label={label} />
                    {suffix}

                    <div className={`sft-actions-group ${actionsClass}`} onClick={(e) => e.stopPropagation()}>
                        {sortable && (
                            <Tooltip content={`Sort by ${label}`}>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleSort(); }}
                                    className="sft-icon-btn"
                                >
                                    <SortIcon currentSort={currentSort} />
                                </button>
                            </Tooltip>
                        )}

                        {searchable && (
                            <div className="sft-popover-wrapper" ref={popoverRef}>
                                <Tooltip content={hasFilter ? `Clear filter: ${label}` : `Search ${label}`}>
                                    <button
                                        type="button"
                                        onClick={togglePopover}
                                        className={`sft-icon-btn ${hasFilter ? "has-filter" : ""}`}
                                    >
                                        {hasFilter ? <Filter className="sft-icon" /> : <Search className="sft-icon" />}
                                    </button>
                                </Tooltip>

                                {isPopoverOpen && (
                                    <div className="sft-popover" onClick={(e) => e.stopPropagation()}>
                                        <p className="sft-popover-title">Filter {label}</p>
                                        <div className="sft-popover-input-group">
                                            <div className="sft-input-wrapper">
                                                <Search className="sft-input-icon" />
                                                <input
                                                    ref={inputRef}
                                                    type="text"
                                                    placeholder={`Search ${label.toLowerCase()}…`}
                                                    value={localFilter}
                                                    onChange={(e) => setLocalFilter(e.target.value)}
                                                    onKeyDown={(e) => e.key === "Escape" && setOpenPopover(null)}
                                                    className="sft-input"
                                                />
                                            </div>
                                            {hasFilter && (
                                                <button
                                                    type="button"
                                                    onClick={clearFilter}
                                                    className="sft-clear-btn"
                                                    title="Clear filter"
                                                >
                                                    <X className="sft-icon" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </>
        );
    }
);

SortableFilterableTableHeader.displayName = "SortableFilterableTableHeader";