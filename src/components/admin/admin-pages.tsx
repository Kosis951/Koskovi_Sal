"use client";

import { UserPlus } from "lucide-react";
import { useState } from "react";
import { AdminBookingsList } from "@/components/admin/admin-bookings-list";
import { AdminHistory } from "@/components/admin/admin-history";
import { AdminHolidays } from "@/components/admin/admin-holidays";
import { AdminLayout } from "@/components/admin/admin-layout";
import { AdminOverview } from "@/components/admin/admin-overview";
import { AdminTrainings } from "@/components/admin/admin-trainings";
import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { buttonPrimary } from "@/components/ui/styles";

export function AdminOverviewPage() {
  return (
    <AdminLayout
      description="Co se děje v sále tento týden a co čeká na vyřízení."
      section="overview"
      title="Přehled"
    >
      <AdminOverview />
    </AdminLayout>
  );
}

export function AdminBookingsPage() {
  return (
    <AdminLayout
      description="Všechny naplánované akce a tréninky. Kliknutím na řádek je upravíš."
      section="bookings"
      title="Akce"
    >
      <AdminBookingsList />
    </AdminLayout>
  );
}

export function AdminTrainingsPage() {
  return (
    <AdminLayout
      description="Změna trenéra nebo aktivity se týká jen nejbližšího termínu, další týdny zůstanou beze změny."
      section="trainings"
      title="Pravidelné tréninky"
    >
      <AdminTrainings />
    </AdminLayout>
  );
}

export function AdminHolidaysPage() {
  return (
    <AdminLayout
      description="V zadaném období se pravidelné tréninky nevytvoří. Ručně přidané akce zůstanou."
      section="holidays"
      title="Prázdniny a volno"
    >
      <AdminHolidays />
    </AdminLayout>
  );
}

export function AdminHistoryPage() {
  return (
    <AdminLayout
      description="Kdo co v kalendáři změnil. Smazané akce a úpravy jde vrátit."
      section="history"
      title="Historie změn"
    >
      <AdminHistory />
    </AdminLayout>
  );
}

export function AdminUsersPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <AdminLayout
      actions={
        <button className={buttonPrimary} onClick={() => setIsCreateOpen(true)} type="button">
          <UserPlus size={16} />
          Nový uživatel
        </button>
      }
      adminOnly
      description="Kdo se může přihlásit a co smí v kalendáři měnit."
      section="users"
      title="Uživatelé"
    >
      <AdminUsersTable isCreateOpen={isCreateOpen} onCreateOpenChange={setIsCreateOpen} />
    </AdminLayout>
  );
}
