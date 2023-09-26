import { Test } from '@nestjs/testing';
import test from 'ava';

test('should be able to bootstrap sync server', async t => {
  // set env before import
  process.env.SERVER_FLAVOR = 'sync';
  const { AppModule } = await import('../src/app');
  await t.notThrowsAsync(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = module.createNestApplication();
    await app.close();
  });
  process.env.SERVER_FLAVOR = '';
});
