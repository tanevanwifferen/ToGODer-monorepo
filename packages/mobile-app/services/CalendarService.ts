import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';

interface CalendarEvent {
  title: string;
  date: Date;
}

interface CacheEntry {
  events: CalendarEvent[];
  timestamp: number;
}

export class CalendarService {
  private static cache: Map<string, CacheEntry> = new Map();
  private static readonly CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
  private static cache_clear_time = new Date();

  private static getCacheKey(startDate: Date, endDate: Date): string {
    return `${startDate.toDateString()}-${endDate.toDateString()}`;
  }

  private static async getEventsByDateRange(startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
    if (Platform.OS === 'web') {
      return [];
    }

    const cacheKey = this.getCacheKey(startDate, endDate);
    const cachedEntry = this.cache.get(cacheKey);
    
    if (cachedEntry && (Date.now() - cachedEntry.timestamp < this.CACHE_DURATION)) {
      return cachedEntry.events;
    }

    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        return [];
      }

      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const calendarIds = calendars.map((calendar: Calendar.Calendar) => calendar.id);

      const events: CalendarEvent[] = [];
      for (const calendarId of calendarIds) {
        const calendarEvents = await Calendar.getEventsAsync(
          [calendarId],
          startDate,
          endDate
        );

        events.push(
          ...calendarEvents.map((event: Calendar.Event) => ({
            title: event.title,
            date: new Date(event.startDate)
          }))
        );
      }

      const sortedEvents = events.sort((a, b) => a.date.getTime() - b.date.getTime());
      
      this.cache.set(cacheKey, {
        events: sortedEvents,
        timestamp: Date.now()
      });

      this.clearCacheIfNeeded();

      return sortedEvents;
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      return [];
    }
  }

  private static clearCacheIfNeeded() {
    if(this.cache_clear_time.getTime() < Date.now()) {
      this.cache.forEach((value, key) => {
        if(Date.now() - value.timestamp > this.CACHE_DURATION) {
          this.cache.delete(key);
        }
      });
      this.cache_clear_time = new Date(Date.now() + this.CACHE_DURATION);
    }
  }

  static async getPastWeekEvents(): Promise<CalendarEvent[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    return this.getEventsByDateRange(startDate, endDate);
  }

  static async getUpcomingWeekEvents(): Promise<CalendarEvent[]> {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);
    return this.getEventsByDateRange(startDate, endDate);
  }

  // Keeping this for backward compatibility
  static async getUpcomingEvents(): Promise<CalendarEvent[]> {
    return this.getUpcomingWeekEvents();
  }
}
