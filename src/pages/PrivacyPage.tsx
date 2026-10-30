import React from 'react';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-editorial text-lg font-bold text-[#1E2320]">
        {title}
      </h2>
      <div className="text-sm text-[#5F635D] leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  );
}

export function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="pb-4 border-b border-[#E5E1D8]">
        <h1 className="font-editorial text-3xl font-bold tracking-tight text-[#1E2320]">
          Privacy Policy
        </h1>
        <p className="text-sm text-[#5F635D] mt-1">
          Last updated: 25 October 2026. This policy explains what Locora
          collects, why it collects it, and what control you have over it.
        </p>
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-[#E5E1D8] shadow-xs space-y-8">
        <Section title="What Locora is">
          <p>
            Locora is a hyperlocal event discovery and community engagement
            platform. People discover nearby events, register for them, save
            events they like, and organizers publish events for their
            neighborhood. Locora is free to use and does not run ads.
          </p>
        </Section>

        <Section title="Information we collect">
          <p>
            <strong className="text-[#1E2320]">Account information.</strong>{' '}
            When you sign in with Google, we receive your name, email address,
            and profile picture from Google, and we store them so we can show
            you as signed in and attribute your events and registrations to
            you. If you create an account with an email and password instead,
            we store the name and email you provide.
          </p>
          <p>
            <strong className="text-[#1E2320]">Events and activity.</strong>{' '}
            Events you publish, events you register for, events you save, and
            preferences such as your home location (city and state) and interests are
            stored so the service can work: listings, tickets, recommendations,
            and your dashboard all depend on them. Events you publish are
            visible to other Locora users by design.
          </p>
          <p>
            <strong className="text-[#1E2320]">Registration details.</strong>{' '}
            For events that require attendee details, your full name, mobile
            number, and email address are shared with that event&apos;s
            organizer only, so they can manage registrations. They are never
            shown publicly or shared with other attendees.
          </p>
          <p>
            <strong className="text-[#1E2320]">
              Browser storage and cookies.
            </strong>{' '}
            Parts of your session, registrations, and saved events are kept in
            your browser&apos;s local storage. During Google sign-in, we set
            a short-lived cookie that holds a one-time security token to
            prevent forged sign-in requests. It is not used for tracking or
            advertising.
          </p>
        </Section>

        <Section title="Adding events to Google Calendar">
          <p>
            Event pages have an &quot;Add to Google Calendar&quot; button.
            Clicking it opens Google Calendar in your browser with that
            event&apos;s title, date and time, venue, and description already
            filled in, and you save it yourself from there. Locora does not
            connect to your Google Calendar account, does not request any
            calendar permission, does not store any calendar token, and never
            reads your calendar events. Because the saved event is yours in
            Google Calendar, cancelling a Locora registration does not delete
            it — delete it in Google Calendar if you no longer want it.
          </p>
        </Section>

        <Section title="Google sign-in">
          <p>
            Sign-in uses Google OAuth. Locora does not see or store your
            Google password. We only receive the basic profile information
            described above, and we use it to create and recognize your
            Locora account.
          </p>
        </Section>

        <Section title="How your information is stored and shared">
          <p>
            Locora&apos;s shared event data is stored in a hosted database,
            and the site itself is hosted on a cloud hosting platform. These
            providers store and process data only to run the service. Beyond
            that, Locora does not sell your personal information and does not
            share it with advertisers. Information is disclosed only if
            required by law.
          </p>
        </Section>

        <Section title="Your control">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-[#1E2320]">Cancel a registration</strong>{' '}
              from the event page at any time. Note that this does not delete
              an event you already saved to your own Google Calendar with the
              &quot;Add to Google Calendar&quot; button — delete that in
              Google Calendar if you no longer want it.
            </li>
            <li>
              <strong className="text-[#1E2320]">Sign out</strong> from your
              Profile page at any time.
            </li>
          </ul>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If this policy changes in a way that affects how your data is
            used, the &quot;Last updated&quot; date above will change, and
            the updated policy will be posted on this page. Continued use of
            Locora after a change means you accept the updated policy.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy can be sent to the developer contact
            email listed on Locora&apos;s Google OAuth consent screen.
          </p>
        </Section>
      </div>
    </div>
  );
}
