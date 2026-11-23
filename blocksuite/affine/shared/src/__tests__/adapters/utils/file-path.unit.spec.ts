import { describe, expect, it } from 'vitest';

import { getImageFullPath } from '../../../adapters/utils/file-path';

describe('getImageFullPath', () => {
  it('should resolve relative image paths correctly', () => {
    const filePath = 'path/to/markdown/file.md';

    // Test relative path in same directory
    expect(getImageFullPath(filePath, 'image.png')).toBe(
      'path/to/markdown/image.png'
    );

    // Test relative path in subdirectory
    expect(getImageFullPath(filePath, 'images/photo.jpg')).toBe(
      'path/to/markdown/images/photo.jpg'
    );

    // Test relative path in subdirectory
    expect(getImageFullPath(filePath, './images/photo.jpg')).toBe(
      'path/to/markdown/images/photo.jpg'
    );

    // Test relative path with parent directory
    expect(getImageFullPath(filePath, '../images/photo.jpg')).toBe(
      'path/to/images/photo.jpg'
    );

    // Test relative path with multiple parent directories
    expect(getImageFullPath(filePath, '../../images/photo.jpg')).toBe(
      'path/images/photo.jpg'
    );

    // Test relative path with multiple parent directories (which is not supported)
    expect(getImageFullPath(filePath, '../../../../images/photo.jpg')).toBe(
      'images/photo.jpg'
    );
  });

  it('should handle absolute image paths correctly', () => {
    const filePath = 'path/to/markdown/file.md';

    // Test absolute path
    expect(getImageFullPath(filePath, '/images/photo.jpg')).toBe(
      'images/photo.jpg'
    );
  });

  it('should handle URL-encoded image paths correctly', () => {
    const filePath = 'path/to/markdown/file.md';

    // Test URL-encoded spaces
    expect(getImageFullPath(filePath, 'my%20photo.jpg')).toBe(
      'path/to/markdown/my photo.jpg'
    );
  });
});
