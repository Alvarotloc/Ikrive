/**
 * Lists whose rows start with a category `Badge` (stamp), then the row text and its actions: other
 * expenses, refuels, maintenance and odometer readings of the vehicle page.
 *
 * From `sm` up the list is a three-column grid (badge, text, actions) and every row takes the columns
 * of the list with `subgrid`, so the badge column is as wide as the longest label of the whole list,
 * in any language, and every title starts at the same x. Groups between the list and its rows (the
 * years of the maintenance timeline) also use `badgeListRowClassName`, so the alignment spans the
 * whole list, not each group. Below `sm` nothing changes: each row keeps its own grid.
 */
export const badgeListClassName = 'sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-3';

/** A row (or a group of rows) of a `badgeListClassName` list: from `sm` up it spans the list's columns. */
export const badgeListRowClassName = 'sm:col-span-full sm:grid sm:grid-cols-subgrid';
