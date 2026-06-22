import { useState, useEffect } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';

export function CountdownTimer({ time }: { time: string }) {
  const [, setTicker] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTicker(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  try {
    const targetDate = new Date(time);
    if (isNaN(targetDate.getTime())) return null;
    return <span>{formatDistanceToNowStrict(targetDate, { addSuffix: true })}</span>;
  } catch {
    return null;
  }
}
