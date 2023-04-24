// FAIL LOUDLY on unhandled promise rejections / errors
process.on('unhandledRejection', reason => {
  console.log('FAILED TO HANDLE PROMISE REJECTION');
  throw reason;
});
