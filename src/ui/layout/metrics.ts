export const floatingDockMetrics = {
  height: 68,
  bottom: 12,
  contentGap: 32,
  horizontal: 18
} as const;

export const floatingDockContentInset =
  floatingDockMetrics.height + floatingDockMetrics.bottom + floatingDockMetrics.contentGap;

