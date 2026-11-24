import PillarPage from '../_components/PillarPage';
import { pageMetadata } from '../_lib/seo';
import { CHAT } from './content';

export const metadata = pageMetadata({
  path: '/chat',
  title: 'Chat: message real people, home to home | Pantopus',
  description:
    'Private messages and group chats with the people in your life: your household, your plans, your connections. And a kind note to a home on your block.',
});

export default function ChatPage() {
  return <PillarPage c={CHAT} />;
}
