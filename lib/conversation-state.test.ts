import { describe, it, expect } from 'vitest';
import { conversationReducer, initialState, WELCOME_MESSAGE } from './conversation-state';
import type { ConversationState, RouteOption } from './types';

const mockRouteOption: RouteOption = {
  id: 'r1',
  name: 'Northern Hills',
  description: 'Head north',
  route: {
    geometry: [[41.9, 2.8, 100]],
    distance_km: 60,
    distance_mi: 37.3,
    elevation_gain_m: 890,
    elevation_gain_ft: 2920,
    start_point: { lat: 41.9, lng: 2.8 },
  },
  gpx: '<gpx>mock</gpx>',
  color: '#E8503A',
};

describe('conversationReducer', () => {
  it('starts with welcome message and chatting phase', () => {
    expect(initialState.phase).toBe('chatting');
    expect(initialState.messages).toHaveLength(1);
    expect(initialState.messages[0]).toBe(WELCOME_MESSAGE);
    expect(initialState.streamingText).toBeNull();
    expect(initialState.routeOptions).toBeNull();
    expect(initialState.selectedRouteIndex).toBeNull();
  });

  it('ADD_USER_MESSAGE transitions to generating and appends message', () => {
    const state = conversationReducer(initialState, {
      type: 'ADD_USER_MESSAGE',
      content: '60km hilly loop',
    });

    expect(state.phase).toBe('generating');
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1].role).toBe('user');
    expect(state.messages[1].content).toBe('60km hilly loop');
    expect(state.streamingText).toBeNull();
    expect(state.routeOptions).toBeNull();
  });

  it('START_STREAMING initializes streaming text', () => {
    const generating: ConversationState = { ...initialState, phase: 'generating' };
    const state = conversationReducer(generating, { type: 'START_STREAMING' });

    expect(state.streamingText).toBe('');
  });

  it('APPEND_STREAM_CHUNK accumulates text', () => {
    const streaming: ConversationState = {
      ...initialState,
      phase: 'generating',
      streamingText: 'Hello',
    };
    const state = conversationReducer(streaming, {
      type: 'APPEND_STREAM_CHUNK',
      chunk: ' world',
    });

    expect(state.streamingText).toBe('Hello world');
  });

  it('APPEND_STREAM_CHUNK handles null streamingText', () => {
    const state = conversationReducer(initialState, {
      type: 'APPEND_STREAM_CHUNK',
      chunk: 'first',
    });

    expect(state.streamingText).toBe('first');
  });

  it('FINISH_STREAMING transitions to chatting and adds assistant message', () => {
    const streaming: ConversationState = {
      ...initialState,
      phase: 'generating',
      streamingText: 'Where are you riding?',
    };
    const state = conversationReducer(streaming, {
      type: 'FINISH_STREAMING',
      content: 'Where are you riding?',
    });

    expect(state.phase).toBe('chatting');
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1].role).toBe('assistant');
    expect(state.messages[1].content).toBe('Where are you riding?');
    expect(state.streamingText).toBeNull();
  });

  it('SET_ROUTE_OPTIONS transitions to options and stores routes', () => {
    const generating: ConversationState = { ...initialState, phase: 'generating' };
    const options = [mockRouteOption];
    const state = conversationReducer(generating, {
      type: 'SET_ROUTE_OPTIONS',
      options,
      aiMessage: 'Here are 3 options:',
    });

    expect(state.phase).toBe('options');
    expect(state.routeOptions).toEqual(options);
    expect(state.selectedRouteIndex).toBeNull();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1].routeOptions).toEqual(options);
    expect(state.streamingText).toBeNull();
  });

  it('SELECT_ROUTE transitions to detail', () => {
    const withOptions: ConversationState = {
      ...initialState,
      phase: 'options',
      routeOptions: [mockRouteOption],
    };
    const state = conversationReducer(withOptions, {
      type: 'SELECT_ROUTE',
      index: 0,
    });

    expect(state.phase).toBe('detail');
    expect(state.selectedRouteIndex).toBe(0);
  });

  it('BACK_TO_OPTIONS returns to options and clears selection', () => {
    const detail: ConversationState = {
      ...initialState,
      phase: 'detail',
      routeOptions: [mockRouteOption],
      selectedRouteIndex: 0,
    };
    const state = conversationReducer(detail, { type: 'BACK_TO_OPTIONS' });

    expect(state.phase).toBe('options');
    expect(state.selectedRouteIndex).toBeNull();
  });

  it('SET_ERROR transitions to chatting and adds error as assistant message', () => {
    const generating: ConversationState = { ...initialState, phase: 'generating' };
    const state = conversationReducer(generating, {
      type: 'SET_ERROR',
      message: "Couldn't find roads in that area.",
    });

    expect(state.phase).toBe('chatting');
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1].role).toBe('assistant');
    expect(state.messages[1].content).toBe("Couldn't find roads in that area.");
    expect(state.streamingText).toBeNull();
  });

  it('SET_USER_LOCATION stores location', () => {
    const state = conversationReducer(initialState, {
      type: 'SET_USER_LOCATION',
      location: { latitude: 41.9, longitude: 2.8 },
    });

    expect(state.userLocation).toEqual({ latitude: 41.9, longitude: 2.8 });
  });

  it('SET_START_POINT stores start point', () => {
    const state = conversationReducer(initialState, {
      type: 'SET_START_POINT',
      point: { lat: 42.0, lng: 2.9 },
    });

    expect(state.startPoint).toEqual({ lat: 42.0, lng: 2.9 });
  });

  it('SET_START_POINT can clear start point with null', () => {
    const withStart: ConversationState = {
      ...initialState,
      startPoint: { lat: 42.0, lng: 2.9 },
    };
    const state = conversationReducer(withStart, {
      type: 'SET_START_POINT',
      point: null,
    });

    expect(state.startPoint).toBeNull();
  });

  it('RESET returns to initial state but preserves userLocation', () => {
    const complex: ConversationState = {
      phase: 'detail',
      messages: [WELCOME_MESSAGE, { id: 'm1', role: 'user', content: 'test', timestamp: 1 }],
      streamingText: null,
      routeOptions: [mockRouteOption],
      selectedRouteIndex: 0,
      userLocation: { latitude: 41.9, longitude: 2.8 },
      startPoint: { lat: 42.0, lng: 2.9 },
    };
    const state = conversationReducer(complex, { type: 'RESET' });

    expect(state.phase).toBe('chatting');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toBe(WELCOME_MESSAGE);
    expect(state.routeOptions).toBeNull();
    expect(state.selectedRouteIndex).toBeNull();
    expect(state.userLocation).toEqual({ latitude: 41.9, longitude: 2.8 });
    expect(state.startPoint).toBeNull();
  });

  it('ADD_USER_MESSAGE clears previous route options', () => {
    const withOptions: ConversationState = {
      ...initialState,
      phase: 'options',
      routeOptions: [mockRouteOption],
      selectedRouteIndex: 0,
    };
    const state = conversationReducer(withOptions, {
      type: 'ADD_USER_MESSAGE',
      content: 'Make it flatter',
    });

    expect(state.routeOptions).toBeNull();
    expect(state.selectedRouteIndex).toBeNull();
  });
});
