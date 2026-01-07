import { useEffect, useState } from 'react';

export function usePowerState() {
  const [onBattery, setOnBattery] = useState(false);

  useEffect(() => {
    window.__apis.getPowerState().then(setOnBattery);
  }, []);

  return onBattery;
}
