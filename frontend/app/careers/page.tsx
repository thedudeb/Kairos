/**
 * There is no centralized careers portal — job listings are accessible
 * only via their direct link (/careers/{slug}).
 *
 * This page intentionally returns 404 to match the product spec:
 * "there is no centralized portal; listings are accessible only via their direct link."
 */
import { notFound } from "next/navigation";

export default function CareersIndexPage() {
  notFound();
}
