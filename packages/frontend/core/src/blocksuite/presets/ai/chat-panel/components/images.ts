import { html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

export const renderImages = (images: string[]) => {
  return html`<style>
      .images-container {
        display: flex;
        gap: 12px;
        flex-direction: column;
        margin-bottom: 8px;
      }
      .image-container {
        border-radius: 4px;
        overflow: hidden;
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        width: 70%;
        max-width: 320px;

        img {
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
        }
      }
    </style>
    <div class="images-container">
      ${repeat(
        images,
        image => image,
        image => {
          return html`<div class="image-container">
            <img src="${image}" />
          </div>`;
        }
      )}
    </div>`;
};
