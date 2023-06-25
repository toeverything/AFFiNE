/// <reference types="react/experimental" />

import { Editor } from './components/editor.js';

const App = () => {
  return (
    <div>
      <h1 className="text-4xl font-bold">AFFiNE Developer Document</h1>
      <div className="mt-2 mx-3 border-blue-300 border-2">
        <Editor />
      </div>
    </div>
  );
};

export default App;
