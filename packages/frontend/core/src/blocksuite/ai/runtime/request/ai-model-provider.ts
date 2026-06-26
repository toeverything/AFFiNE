import type { AIModelService } from '@affine/core/modules/ai-button/services/models';

let currentModelService: AIModelService | null = null;

export function setAIModelService(service: AIModelService | null) {
  currentModelService = service;
}

export function getAIModelService() {
  if (!currentModelService) {
    throw new Error('AIModelService is not initialized');
  }
  return currentModelService;
}

export function hasAIModelService() {
  return !!currentModelService;
}
