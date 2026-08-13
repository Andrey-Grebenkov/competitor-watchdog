export const ghostButton =
  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 no-underline transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white";

export const ghostButtonWarning =
  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 no-underline transition hover:bg-amber-50 hover:text-amber-600 dark:text-slate-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-400";

export const ghostButtonDanger =
  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-red-600 no-underline transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300";

export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white no-underline shadow-sm transition hover:bg-blue-500 disabled:opacity-50";

export const card =
  "rounded-xl border border-black/10 bg-white shadow-sm dark:border-white/15 dark:bg-white/5";

export const input =
  "rounded-lg border border-black/15 bg-white px-3 py-2 shadow-sm transition outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/20 dark:bg-transparent";

export const errorText = "text-sm text-red-600";

export const inlineErrorText = "px-3 text-xs text-red-600";

export const mutedText = "text-sm text-black/60 dark:text-white/60";

export const subtleText = "text-xs text-black/50 dark:text-white/50";

export const tableHeadRow =
  "border-b border-black/10 text-left text-slate-500 dark:border-white/15 dark:text-slate-400";

export const tableBodyRow =
  "border-b border-black/5 transition last:border-0 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5";

export const tableCell = "px-4 py-3";

export const tableHeadCell = "px-4 py-3 font-medium";

const badgeBase =
  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset";

export const badge = {
  success: `${badgeBase} bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-950/40 dark:text-green-300 dark:ring-green-400/20`,
  neutral: `${badgeBase} bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-white/10`,
  alert: `${badgeBase} bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-400/20`,
  accent: `${badgeBase} bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-400/20`,
} as const;
