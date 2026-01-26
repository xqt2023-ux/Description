import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HomePage from '@/app/page';

// Mock the API module
vi.mock('@/lib/api', () => ({
  mediaApi: {
    upload: vi.fn(),
  },
  aiApi: {
    planTasks: vi.fn().mockResolvedValue({
      data: {
        success: true,
        data: {
          userIntent: 'Test intent',
          tasks: [
            { id: 'task-1', type: 'translate', name: 'Translate', description: 'Translate video', status: 'pending' },
          ],
          summary: 'Test summary',
        },
      },
    }),
  },
}));

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the main heading', () => {
    render(<HomePage />);
    expect(screen.getByText('What can I help you with?')).toBeInTheDocument();
  });

  it('renders navigation items', () => {
    render(<HomePage />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  it('renders quick action buttons', () => {
    render(<HomePage />);
    expect(screen.getByText('Translate & dub video')).toBeInTheDocument();
    expect(screen.getByText('Clean up video recording')).toBeInTheDocument();
  });

  it('renders New Project button', () => {
    render(<HomePage />);
    // There are multiple "New Project" elements (button and quick action card)
    const newProjectElements = screen.getAllByText('New Project');
    expect(newProjectElements.length).toBeGreaterThan(0);
  });
});

describe('Translate & Dub Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens workflow when clicking Translate & dub video', async () => {
    render(<HomePage />);
    
    const translateButton = screen.getByText('Translate & dub video');
    fireEvent.click(translateButton);

    await waitFor(() => {
      expect(screen.getByText('What do you want to do?')).toBeInTheDocument();
    });
  });

  it('shows file upload area in workflow', async () => {
    render(<HomePage />);
    
    const translateButton = screen.getByText('Translate & dub video');
    fireEvent.click(translateButton);

    await waitFor(() => {
      expect(screen.getByText('Upload a video or audio file')).toBeInTheDocument();
    });
  });

  it('has working back button in workflow', async () => {
    render(<HomePage />);
    
    // Open workflow
    const translateButton = screen.getByText('Translate & dub video');
    fireEvent.click(translateButton);

    // In workflow mode, click the Home button in sidebar to go back
    await waitFor(() => {
      // Look for Home in the sidebar - should appear
      const homeButtons = screen.getAllByText('Home');
      expect(homeButtons.length).toBeGreaterThan(0);
      fireEvent.click(homeButtons[0]);
    });

    // Should be back to main page
    await waitFor(() => {
      // Look for the main page elements
      expect(screen.getByText('What can I help you with?')).toBeInTheDocument();
    }, { timeout: 2000 });
  });
});
