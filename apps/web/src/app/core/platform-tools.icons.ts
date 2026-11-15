import { addIcons } from 'ionicons';
import {
  bagCheckOutline, briefcaseOutline, cloudDownloadOutline, documentsOutline, linkOutline, micOutline, sparklesOutline, tabletLandscapeOutline,
  trendingUpOutline,
} from 'ionicons/icons';

/** Icons for the career-tools hub entries of the platform modules (AI, webhooks, career path, clipper, portals, experts, interview, documents). */
export function registerPlatformToolIcons() {
  addIcons({
    sparklesOutline, linkOutline, trendingUpOutline, cloudDownloadOutline, briefcaseOutline, bagCheckOutline, micOutline, documentsOutline, tabletLandscapeOutline,
  });
}
