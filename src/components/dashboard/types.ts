export type AppMode = "hall" | "lessons";

export type ViewMode = "today" | "week" | "month";

export type LessonFilter = {
  type: "all" | "dancer" | "trainer";
  value: string;
};

export const allLessonsFilter: LessonFilter = { type: "all", value: "" };
