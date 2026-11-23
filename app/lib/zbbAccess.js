// Who sees Finance > Zero-Based Budget in the menus. The API (POST /zbb) enforces
// the same list server-side (ZBB_ALLOWED_EMAILS); this only hides the menu item.
export const ZBB_OWNERS = ["ben.smith@earthbreeze.com"];
export const canSeeZbb = (email) => !!email && ZBB_OWNERS.includes(String(email).toLowerCase());
