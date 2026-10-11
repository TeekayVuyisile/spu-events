import { formatCents } from '@monthati/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Loader2, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { TicketStatusBadge } from '@/components/tickets/ticket-status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { attendeesCsvUrl, attendeesQuery } from '@/lib/admin';
import { formatDateTime } from '@/lib/admin-format';

/** Everyone holding a ticket for one event, searchable, with a CSV download for the door list. */
export function AttendeesPage() {
  const { id = '' } = useParams();
  const list = useQuery(attendeesQuery(id));
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const attendees = (list.data?.attendees ?? []).filter(
    (a) =>
      !q ||
      a.name.toLowerCase().includes(q) ||
      a.email.includes(q) ||
      a.code.toLowerCase().includes(q) ||
      a.studentNumber?.includes(q),
  );
  const checkedIn = list.data?.attendees.filter((a) => a.status === 'used').length ?? 0;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to={`/admin/events/${id}`}>
            <ArrowLeft aria-hidden /> Event
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold md:text-4xl">Attendees</h1>
            {list.data && (
              <p className="tabular text-muted-foreground">
                {list.data.event.title} · {list.data.attendees.length}/{list.data.event.capacity}{' '}
                tickets · {checkedIn} checked in
              </p>
            )}
          </div>
          {/* A real link: the browser downloads the file with the session cookie. */}
          <Button asChild variant="outline">
            <a href={attendeesCsvUrl(id)} download>
              <Download aria-hidden /> Download CSV
            </a>
          </Button>
        </div>
      </div>

      <div className="relative w-full sm:w-80">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, email, student number or code"
          aria-label="Search attendees"
          className="pl-9"
        />
      </div>

      <Card className="overflow-hidden">
        {list.isPending ? (
          <p className="flex items-center gap-2 p-5 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden /> Loading attendees…
          </p>
        ) : list.isError ? (
          <div className="p-5">
            <FormAlert message={list.error.message} />
          </div>
        ) : attendees.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <Users className="size-10 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <p className="font-display text-lg font-semibold">
              {q ? 'Nobody matches' : 'No tickets yet'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <caption className="sr-only">Attendees</caption>
              <thead className="sticky top-0 border-b bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Student number
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Ticket
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    Paid
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {attendees.map((a) => (
                  <tr key={a.ticketId} className="h-11">
                    <th scope="row" className="px-5 py-2 text-left font-normal">
                      <span className="block font-medium">{a.name}</span>
                      <span className="block text-xs text-muted-foreground">{a.email}</span>
                    </th>
                    <td className="tabular px-3 py-2">{a.studentNumber ?? '—'}</td>
                    <td className="tabular px-3 py-2">{a.code}</td>
                    <td className="tabular px-3 py-2 text-right">
                      {a.pricePaidCents ? formatCents(a.pricePaidCents) : 'Free'}
                    </td>
                    <td className="px-5 py-2">
                      <TicketStatusBadge ticket={{ status: a.status, cancelReason: null }} />
                      {a.checkedInAt && (
                        <span className="tabular mt-1 block text-xs text-muted-foreground">
                          {formatDateTime(a.checkedInAt)}
                          {a.checkedInGate && ` · ${a.checkedInGate}`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
