export function formatOperationalTime(value) {
  const time = new Date(value || Date.now());
  return time.toLocaleTimeString('en-US', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  });
}
