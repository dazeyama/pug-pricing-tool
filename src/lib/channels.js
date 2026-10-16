// Realtime channel names (FABLE_REPORT A3). Supabase hands back the channel
// already open under a name, so every subscription needs a name of its own,
// even the same page mounted twice (React's development double mount, or a
// collection reopened before the old channel has gone). A counter for this
// page load makes them unique, and readable in a log: "collection:<id>:3".
let seq = 0;

/** A new channel name: the parts, then a number no other channel this page load has. */
export const channelName = (...parts) => [...parts, ++seq].join(':');
