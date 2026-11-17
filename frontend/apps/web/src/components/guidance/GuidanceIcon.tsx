'use client';

import {
  Activity, Bell, Calendar, CircleCheck, Clock, Ellipsis, House, Inbox, Link, List, Lock, Mail, Map, MapPin,
  MessageCircle, Newspaper, PanelBottom, PanelLeft, Send, ShieldCheck, Sun, Users, type LucideIcon,
} from 'lucide-react';
import type { GuidanceIconName } from './cards';

const ICONS: Record<GuidanceIconName, LucideIcon> = {
  house: House,
  lock: Lock,
  'panel-bottom': PanelBottom,
  'panel-left': PanelLeft,
  list: List,
  sun: Sun,
  'circle-check': CircleCheck,
  newspaper: Newspaper,
  mail: Mail,
  inbox: Inbox,
  ellipsis: Ellipsis,
  activity: Activity,
  map: Map,
  users: Users,
  bell: Bell,
  'shield-check': ShieldCheck,
  'message-circle': MessageCircle,
  clock: Clock,
  send: Send,
  calendar: Calendar,
  link: Link,
  'map-pin': MapPin,
};

/** An outlined row icon, in the card's text colour; screen readers skip it. */
export default function GuidanceIcon({ name, className }: { name: GuidanceIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden focusable={false} strokeWidth={1.75} className={className} />;
}
