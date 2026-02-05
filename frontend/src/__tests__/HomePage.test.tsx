import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HomePage from '@/app/page';
import { mediaApi } from '@/lib/api';

// Mock the API module
vi.mock('@/lib/api', () => ({
  mediaApi: {
    upload: vi.fn(),
    getAll: vi.fn().mockResolvedValue({
      data: {
        success: true,
        data: [],
      },
    }),
    getById: vi.fn(),
    validate: vi.fn(),
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
    orchestrateEdit: vi.fn(),
    executePlan: vi.fn(),
  },
  transcriptionApi: {
    startJob: vi.fn(),
    getJobStatus: vi.fn(),
  },
  downloadEditedVideo: vi.fn(() => '/api/export/download/edited.mp4'),
  getUploadUrl: vi.fn((path: string) => path),
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

describe('HomePage - Uploaded Media Display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls mediaApi.getAll on mount', async () => {
    render(<HomePage />);
    await waitFor(() => {
      expect(mediaApi.getAll).toHaveBeenCalledTimes(1);
    });
  });

  it('shows "Uploaded Media" heading and file count when media exists', async () => {
    (mediaApi.getAll as any).mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          { id: 'vid-1', originalName: 'demo.mp4', filePath: '/uploads/videos/demo.mp4', createdAt: new Date().toISOString() },
          { id: 'vid-2', originalName: 'sample.mp4', filePath: '/uploads/videos/sample.mp4', createdAt: new Date().toISOString() },
        ],
      },
    });

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText('Uploaded Media')).toBeInTheDocument();
    });
    expect(screen.getByText('2 files')).toBeInTheDocument();
  });

  it('renders each media item originalName', async () => {
    (mediaApi.getAll as any).mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          { id: 'vid-1', originalName: 'vacation.mp4', filePath: '/uploads/videos/vacation.mp4', createdAt: new Date().toISOString() },
          { id: 'vid-2', originalName: 'presentation.mp4', filePath: '/uploads/videos/presentation.mp4', createdAt: new Date().toISOString() },
        ],
      },
    });

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText('vacation.mp4')).toBeInTheDocument();
    });
    expect(screen.getByText('presentation.mp4')).toBeInTheDocument();
  });

  it('shows empty state when no media has been uploaded', async () => {
    // Default mock already returns empty data array
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText('No media uploaded yet')).toBeInTheDocument();
    });
  });
});
