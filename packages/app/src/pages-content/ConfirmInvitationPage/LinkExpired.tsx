export const LinkExpired = () => {
  return (
    <div>
      <h1>The current invitation link has expired.</h1>
      <a href={location.origin}>Back to home</a>
    </div>
  );
};
