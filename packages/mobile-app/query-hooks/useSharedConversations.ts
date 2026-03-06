/**
 * React Query hooks for managing shared conversations.
 * Provides hooks for listing, viewing, and sharing conversations with proper loading and error states.
 */

import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { ShareApiClient } from '../apiClients/ShareApiClient';
import {
  ShareRequest,
  SharedConversation,
  ListSharedConversationsResponse,
  InfiniteSharedConversationsResponse
} from '../model/ShareTypes';
import { useState } from 'react';

// Number of items to fetch per page
const PAGE_SIZE = 50;

type PageParam = number;

/**
 * Hook for fetching shared conversations with infinite scrolling support
 */
export function useSharedConversationsList() {
  return useInfiniteQuery<
    ListSharedConversationsResponse,
    Error,
    InfiniteSharedConversationsResponse,
    string[],
    PageParam
  >({
    queryKey: ['shared-conversations'],
    queryFn: ({ pageParam }) => ShareApiClient.listSharedConversations(pageParam, PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (
      lastPage: ListSharedConversationsResponse,
      allPages: ListSharedConversationsResponse[]
    ): PageParam | undefined => {
      const totalFetched = allPages.length * PAGE_SIZE;
      return totalFetched < lastPage.total ? allPages.length + 1 : undefined;
    },
  });
}

/**
 * Hook for fetching a single shared conversation by ID
 */
export function useSharedConversation(id: string) {
  return useQuery<SharedConversation, Error>({
    queryKey: ['shared-conversation', id],
    queryFn: () => ShareApiClient.getSharedConversation(id),
    enabled: !!id, // Only fetch if ID is provided
  });
}

interface ShareConversationState {
  isModalVisible: boolean;
  setIsModalVisible: (visible: boolean) => void;
  shareConversation: (request: ShareRequest) => Promise<SharedConversation>;
  isLoading: boolean;
  error: Error | null;
  sharedConversation: SharedConversation | null;
}

/**
 * Hook for sharing a conversation
 * Includes loading and error states and modal visibility control
 */
export function useShareConversation(): ShareConversationState {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [sharedConversation, setSharedConversation] = useState<SharedConversation | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation<SharedConversation, Error, ShareRequest>({
    mutationFn: (request: ShareRequest) => ShareApiClient.shareConversation(request),
    onSuccess: (data) => {
      setSharedConversation(data);
      // Don't close modal immediately so user can see the share URL
      queryClient.invalidateQueries({ queryKey: ['shared-conversations'] });
    },
  });

  return {
    shareConversation: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error,
    isModalVisible,
    setIsModalVisible,
    sharedConversation,
  };
}

/**
 * Hook for copying a shared conversation to create a new chat
 */
export function useCopySharedConversation() {
  return useMutation<{ chatId: string }, Error, string>({
    mutationFn: (id: string) => ShareApiClient.copySharedConversation(id),
  });
}