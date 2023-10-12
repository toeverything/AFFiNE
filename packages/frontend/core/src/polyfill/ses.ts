import 'ses';

if (!process.env.COVERAGE) {
  lockdown({
    evalTaming: 'unsafeEval',
    overrideTaming: 'severe',
    consoleTaming: 'unsafe',
    errorTaming: 'unsafe',
    errorTrapping: 'platform',
    unhandledRejectionTrapping: 'report',
  });

  console.log('SES lockdown complete');
} else {
  Object.defineProperty(globalThis, 'harden', {
    value: (x: any) => Object.freeze(x),
    writable: false,
  });
}
