/**
 * Service for managing route-related functionality.
 * Provides a way to check the current route outside of React components.
 */

let currentRoute: string | null = null;

export class RouteService {
  static setCurrentRoute(route: string) {
    currentRoute = route;
  }

  static getCurrentRoute() {
    return currentRoute;
  }

  static isSharedRoute() {
    return currentRoute?.startsWith('/shared') ?? false;
  }
}