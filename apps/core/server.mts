// static server for web app
import express from 'express';
const app = express();

const PORT = process.env.PORT || 8080;

app.use('/', express.static('dist'));

app.get('/*', (_, res) => {
  res.sendFile('index.html', { root: 'dist' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
