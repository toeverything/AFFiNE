import { fontSMStyle, fontXSStyle } from '@blocksuite/affine-shared/styles';
import { css } from 'lit';

export const COLOR_PICKER_STYLE = css`
  :host {
    display: flex;
    flex-direction: column;
    align-items: normal;
    gap: 12px;
    min-width: 198px;
    padding: 16px;
  }

  nav {
    display: flex;
    padding: 2px;
    align-items: flex-start;
    gap: 4px;
    align-self: stretch;
    border-radius: 8px;
    background: var(--affine-hover-color);
  }

  ${fontXSStyle('nav button')}
  nav button {
    display: flex;
    padding: 4px 8px;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    flex: 1 0 0;

    color: var(--affine-text-secondary-color);
    font-weight: 600;

    border-radius: 8px;
    background: transparent;
    border: none;
  }

  nav button[active] {
    color: var(--affine-text-primary-color, #121212);
    background: var(--affine-background-primary-color);
    box-shadow: var(--affine-shadow-1);
    pointer-events: none;
  }

  .modes {
    display: none;
    gap: 8px;
    align-self: stretch;
  }
  .modes[active] {
    display: flex;
  }

  .modes .mode {
    display: flex;
    padding: 2px;
    flex-direction: column;
    flex: 1 0 0;
  }

  ${fontXSStyle('.modes .mode button')}
  .modes .mode button {
    position: relative;
    display: flex;
    height: 60px;
    padding: 12px 12px 8px;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 4px;
    align-self: stretch;
    border-radius: 8px;
    border: 1px solid var(--affine-border-color);
    box-sizing: border-box;

    font-weight: 400;
    color: #8e8d91;
  }
  .modes .mode.light button {
    background: white;
  }
  .modes .mode.dark button {
    background: #141414;
  }
  .modes .mode button .color-wrapper {
    display: flex;
    position: relative;
    z-index: 0;
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    overflow: hidden;
  }
  .modes .mode button .color-wrapper .color {
    width: 100%;
    height: 100%;
    background: var(--c);
  }
  .modes .mode button .color-wrapper svg {
    position: absolute;
    top: 0;
    left: 0;
    z-index: -1;
    width: 100%;
    height: 100%;
  }
  .modes .mode button[active] {
    pointer-events: none;
    outline: 2px solid var(--affine-brand-color, #1e96eb);
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .color-palette-wrapper {
    position: relative;
    width: 100%;
    height: 170px;
  }

  .color-palette-wrapper canvas {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 8px;
  }
  .color-palette-wrapper::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    bottom: 0;
    border: 1px solid rgba(0, 0, 0, 0.1);
    box-sizing: border-box;
    border-radius: 8px;
    overflow: hidden;
    pointer-events: none;
  }

  .color-circle {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size);
    height: var(--size);
    left: calc(-1 * var(--size) / 2);
    transform: translate(var(--x, 0), var(--y, 0));
    background: transparent;
    border: 0.5px solid #e3e2e4;
    border-radius: 50%;
    box-sizing: border-box;
    box-shadow: 0px 0px 0px 0.5px #e3e3e4 inset;
    filter: drop-shadow(0px 0px 12px rgba(66, 65, 73, 0.14));
    pointer-events: none;
    z-index: 2;
  }
  .color-circle::before {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--c);
    box-sizing: border-box;
  }
  .color-circle::after {
    content: '';
    position: absolute;
    width: calc(var(--size) - 1px);
    height: calc(var(--size) - 1px);
    background: transparent;
    border-style: solid;
    border-color: white;
    border-radius: 50%;
    box-sizing: border-box;
  }

  .color-palette-wrapper {
    --size: calc(var(--r, 12.5px) * 2);
  }
  .color-palette-wrapper .color-circle {
    top: calc(-1 * var(--size) / 2);
  }
  .color-palette-wrapper .color-circle::before {
    opacity: var(--o, 1);
  }
  .color-palette-wrapper .color-circle::after {
    border-width: 4px;
  }
  .color-palette,
  .color-slider {
    position: absolute;
    inset: calc(-1 * var(--size) / 2);
  }

  .color-slider-wrapper:last-of-type {
    margin-bottom: 12px;
  }

  .color-slider-wrapper {
    display: flex;
    align-items: center;
    position: relative;
    width: 100%;
    height: 12px;
  }
  .color-slider-wrapper::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    bottom: 0;
    border-radius: 12px;
    overflow: hidden;
  }
  .color-slider-wrapper {
    --size: calc(var(--r, 10.5px) * 2);
  }
  .color-slider-wrapper .color-circle::after {
    border-width: 2px;
  }
  .color-slider-wrapper.hue::before {
    background: linear-gradient(
      to right,
      #f00 0%,
      #ff0 calc(100% / 6),
      #0f0 calc(200% / 6),
      #0ff 50%,
      #00f calc(400% / 6),
      #f0f calc(500% / 6),
      #f00 100%
    );
  }
  .color-slider-wrapper.alpha::before {
    background:
      linear-gradient(to right, var(--s) 0%, var(--c) 100%),
      conic-gradient(
          #fff 25%,
          #d9d9d9 0deg,
          #d9d9d9 50%,
          #fff 0deg,
          #fff 75%,
          #d9d9d9 0deg
        )
        0% 0% / 8px 8px;
  }
  .color-slider-wrapper.alpha .color-circle::before {
    opacity: var(--o, 1);
  }

  footer {
    display: flex;
    justify-content: space-between;
  }

  .field {
    display: flex;
    padding: 7px 9px;
    align-items: center;
    gap: 4px;
    border-radius: 8px;
    border: 1px solid var(--affine-border-color);
    background: var(--affine-background-primary-color);
    box-sizing: border-box;
  }

  .field.color {
    width: 132px;
  }

  .field.alpha {
    width: 58px;
    gap: 0;
  }

  ${fontSMStyle('input')}
  input {
    display: flex;
    width: 100%;
    padding: 0;
    background: transparent;
    border: none;
    outline: none;
    font-weight: 400;
    color: var(--affine-text-primary-color);
  }

  /* Chrome, Safari, Edge, Opera */
  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  /* Firefox */
  input[type='number'] {
    -moz-appearance: textfield;
  }
`;
