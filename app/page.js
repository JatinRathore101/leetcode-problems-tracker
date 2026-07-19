import { redirect } from "next/navigation";
import {
  DEFAULT_TOPIC,
  DEFAULT_DIFFICULTY,
  topicToSlug,
} from "../lib/constants.js";

// "/" (and "") land on the first sidebar topic's EASY page.
export default function Home() {
  redirect(`/${topicToSlug(DEFAULT_TOPIC)}/${DEFAULT_DIFFICULTY.toLowerCase()}`);
}
