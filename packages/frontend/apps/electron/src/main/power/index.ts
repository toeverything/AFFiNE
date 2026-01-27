import { powerMonitor } from 'electron';

/**
 * Power-related event handlers for the Electron main process.
 */
export const powerEvents = {
  /**
   * Subscribes to system power source changes.
   * Emits the initial state immediately upon subscription.
   * @param emit - Callback function to send power state to the renderer.
   * @returns A cleanup function to remove listeners from powerMonitor.
   */
  'power-source': (emit: (isOnBattery: boolean) => void) => {
    // emit initial state
    emit(powerMonitor.isOnBatteryPower());

    const onBattery = () => emit(true);
    const onAC = () => emit(false);

    powerMonitor.on('on-battery', onBattery);
    powerMonitor.on('on-ac', onAC);

    // cleanup
    return () => {
      powerMonitor.off('on-battery', onBattery);
      powerMonitor.off('on-ac', onAC);
    };
  },
};
