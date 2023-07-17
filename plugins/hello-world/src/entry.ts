export default function (affine: any) {
  console.log('registering hello-world plugin');
  console.log('affine', affine);

  return () => {
    console.log('unregistering hello-world plugin');
  };
}
