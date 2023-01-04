import { redirect } from 'react-router-dom';
import { useEffect } from 'react';

export function AffineBasicPage() {
  useEffect(() => {
    location.href = '/affine-out/index.html';
    redirect('/affine-out/index.html');
  }, []);
  return null;
}
