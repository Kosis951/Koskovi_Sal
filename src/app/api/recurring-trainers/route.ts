import { NextRequest, NextResponse } from "next/server";
import { requireManager, requireSession } from "@/lib/api-auth";
import {
  getRecurringTrainers,
  recurringTrainingLabels,
  updateRecurringTrainers,
  type RecurringTrainerConfig,
} from "@/lib/bookings-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();

  if (auth.error) {
    return auth.error;
  }

  return NextResponse.json(
    {
      labels: recurringTrainingLabels,
      trainers: await getRecurringTrainers(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function PUT(request: NextRequest) {
  const auth = await requireManager();

  if (auth.error) {
    return auth.error;
  }

  const payload = (await request.json()) as {
    trainers?: RecurringTrainerConfig;
  };
  const trainers = await updateRecurringTrainers(payload.trainers ?? {});

  return NextResponse.json({
    labels: recurringTrainingLabels,
    trainers,
  });
}
