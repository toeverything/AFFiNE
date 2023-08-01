import { NextFunction, Request, Response } from 'express';
import onHeaders from 'on-headers';

export const serverTimingAndCache = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  req.res = res;
  const now = process.hrtime();

  onHeaders(res, () => {
    const delta = process.hrtime(now);
    const costInMilliseconds = (delta[0] + delta[1] / 1e9) * 1000;

    const serverTiming = res.getHeader('Server-Timing') as string | undefined;
    const serverTimingValue = `${
      serverTiming ? `${serverTiming}, ` : ''
    }total;dur=${costInMilliseconds}`;

    res.setHeader('Server-Timing', serverTimingValue);
  });

  res.setHeader('Cache-Control', 'max-age=0, private, must-revalidate');

  next();
};
