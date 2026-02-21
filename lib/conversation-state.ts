/**
 * Conversation state reducer for the v1 chat UI.
 *
 * Pure logic — no React dependency. Testable independently.
 */

import type { ConversationState, ConversationAction, Message } from './types';

export const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hey! I'm Roam. Tell me about the ride you're looking for — where, how far, what kind of terrain. Or click the map to set a start point.",
  timestamp: 0,
};

export const initialState: ConversationState = {
  phase: 'chatting',
  messages: [WELCOME_MESSAGE],
  streamingText: null,
  routeOptions: null,
  selectedRouteIndex: null,
  userLocation: null,
  startPoint: null,
};

export function createMessageId(): string {
  return crypto.randomUUID();
}

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction
): ConversationState {
  switch (action.type) {
    case 'ADD_USER_MESSAGE':
      return {
        ...state,
        phase: 'generating',
        messages: [
          ...state.messages,
          {
            id: createMessageId(),
            role: 'user',
            content: action.content,
            timestamp: Date.now(),
          },
        ],
        streamingText: null,
        routeOptions: null,
        selectedRouteIndex: null,
      };

    case 'START_STREAMING':
      return {
        ...state,
        streamingText: '',
      };

    case 'APPEND_STREAM_CHUNK':
      return {
        ...state,
        streamingText: (state.streamingText ?? '') + action.chunk,
      };

    case 'FINISH_STREAMING':
      return {
        ...state,
        phase: 'chatting',
        messages: [
          ...state.messages,
          {
            id: createMessageId(),
            role: 'assistant',
            content: action.content,
            timestamp: Date.now(),
          },
        ],
        streamingText: null,
      };

    case 'SET_ROUTE_OPTIONS':
      return {
        ...state,
        phase: 'options',
        messages: [
          ...state.messages,
          {
            id: createMessageId(),
            role: 'assistant',
            content: action.aiMessage,
            routeOptions: action.options,
            timestamp: Date.now(),
          },
        ],
        streamingText: null,
        routeOptions: action.options,
        selectedRouteIndex: null,
      };

    case 'SELECT_ROUTE':
      return {
        ...state,
        phase: 'detail',
        selectedRouteIndex: action.index,
      };

    case 'BACK_TO_OPTIONS':
      return {
        ...state,
        phase: 'options',
        selectedRouteIndex: null,
      };

    case 'SET_ERROR':
      return {
        ...state,
        phase: 'chatting',
        messages: [
          ...state.messages,
          {
            id: createMessageId(),
            role: 'assistant',
            content: action.message,
            timestamp: Date.now(),
          },
        ],
        streamingText: null,
      };

    case 'SET_USER_LOCATION':
      return {
        ...state,
        userLocation: action.location,
      };

    case 'SET_START_POINT':
      return {
        ...state,
        startPoint: action.point,
      };

    case 'RESET':
      return {
        ...initialState,
        userLocation: state.userLocation,
        messages: [WELCOME_MESSAGE],
      };

    default:
      return state;
  }
}
