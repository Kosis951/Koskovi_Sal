import { NextRequest, NextResponse } from "next/server";
import { requireMainAdmin, requireSession } from "@/lib/api-auth";
import type { LessonFilter } from "@/lib/auth";
import {
  getImportedIndividualLessons,
  replaceImportedIndividualLessons,
  type ImportedIndividualLesson,
} from "@/lib/individual-lessons-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();

  if (auth.error) {
    return auth.error;
  }

  const lessons = await getImportedIndividualLessons();

  return NextResponse.json(
    { lessons: filterLessons(lessons, auth.access.lessonFilter) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireMainAdmin();

  if (auth.error) {
    return auth.error;
  }

  const payload = (await request.json()) as {
    lessons?: unknown;
  };
  const lessons = await replaceImportedIndividualLessons(
    Array.isArray(payload.lessons)
      ? (payload.lessons.filter(isLessonLike) as ImportedIndividualLesson[])
      : [],
  );

  return NextResponse.json(
    { lessons, message: "Rozpis soustředění je uložený." },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function filterLessons(
  lessons: ImportedIndividualLesson[],
  lessonFilter: LessonFilter,
) {
  if (lessonFilter.type === "all" || !lessonFilter.value.trim()) {
    return lessons;
  }

  const query = normalize(lessonFilter.value);

  return lessons.filter((lesson) => {
    if (lessonFilter.type === "trainer") {
      return normalize(lesson.trainer).includes(query);
    }

    return normalize(lesson.name).includes(query);
  });
}

function isLessonLike(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const lesson = value as Record<string, unknown>;

  return ["dateOrDay", "end", "name", "start", "trainer"].every(
    (field) =>
      typeof lesson[field] === "string" &&
      (lesson[field] as string).length <= 200,
  );
}

function normalize(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("cs-CZ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
