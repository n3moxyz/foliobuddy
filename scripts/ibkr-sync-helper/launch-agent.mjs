/** launchctl print exits 113 when the named service is absent. */
export function stopLaunchAgent(run, service) {
  const before = run('print', service);
  if (before.status === 113) return;
  if (before.status !== 0)
    throw new Error('The existing IBKR helper status could not be checked. Nothing was removed.');
  const stopped = run('bootout', service);
  const after = run('print', service);
  if (after.status !== 113)
    throw new Error(
      stopped.status === 0
        ? 'The IBKR helper stop could not be verified. Nothing was removed.'
        : 'The IBKR helper could not be stopped. Nothing was removed.'
    );
}
