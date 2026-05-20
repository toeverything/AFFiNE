import type { AIRequestService } from './service';

let currentRequestService: AIRequestService | null = null;

export function setAIRequestService(service: AIRequestService | null) {
  currentRequestService = service;
}

export function getAIRequestService() {
  if (!currentRequestService) {
    throw new Error('AIRequestService is not initialized');
  }
  return currentRequestService;
}

export function hasAIRequestService() {
  return !!currentRequestService;
}
