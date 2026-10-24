# Dashboard milestone dates

The hero calculated drawdowns from values without retaining their dates.
The chart also omitted a current quote when a valid snapshot already existed today.
Its YTD query ended at midnight, which could exclude today's recorded snapshots.

`calculateDatedDrawdownStats()` now retains the high and trough observations from the same calculation.
The existing numeric helpers keep their return contract.
ATH and trough ties retain the earliest occurrence. A zero decline has no invented date.
Daily drawdown compares the final observations of consecutive local calendar days.
Missing days and invalid values break daily comparisons. Today's final observation is its live quote.

`portfolioTimeline()` sorts and deduplicates observations, then includes the current quote at its actual update timestamp.
YTD queries use the backend summary's UTC year and include today's snapshots.
`buildPortfolioChartData()` matches milestones by exact timestamps and preserves them during downsampling.
Markers outside the selected history are omitted. Coincident markers share their legend entry.
YTD Start appears in the banner only. Shared explanations appear in chart tooltips and accessible legend controls.
Legend toggles capture the open state before Radix closes on pointer-down. The click handler uses that state and cancels Radix's competing click close.
Regression tests send pointer-down, focus, pointer-up, and click. A click-only test cannot detect the second-tap reopening bug.
Pointer clicks suppress the SVG's focus reset, including its active-dot overlay. Keyboard navigation remains available.
Percentage axis labels retain decimals in small ranges so distinct ticks do not all display as zero.
The chart keeps its historical SGD values. Milestone dates and drawdowns follow the USD history used by the hero.

Regression coverage lives in `portfolioHistory.test.ts`, `chartUtils.test.ts`, `usePortfolio.test.ts`, and `NetWorthCard.test.tsx`.
Browser checks cover mobile, tablet, desktop, both chart modes, currency changes, privacy, keyboard navigation, and short ranges.
