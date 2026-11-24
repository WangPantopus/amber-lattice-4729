import { homeManagement } from '@/lib/site/topics/home-management';
import TopicArticle, { topicMetadata } from '../_reading/TopicArticle';

export const metadata = topicMetadata(homeManagement);

export default function Page() {
  return <TopicArticle t={homeManagement} />;
}
