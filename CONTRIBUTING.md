# Contributing to Audio Transcription App

Thank you for your interest in contributing! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Python (for local Whisper models)
- FFmpeg & FFprobe
- Git

### Setup Development Environment
1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/transcriptor.git
   cd transcriptor
   ```
3. Install dependencies:
   ```bash
   npm install
   pip install openai-whisper
   ```
4. Copy environment configuration:
   ```bash
   cp .env.example .env.local
   # Fill in your actual API keys and configuration
   ```
5. Start development server:
   ```bash
   npm run dev
   ```

## 🏗️ Project Structure

```
src/
├── app/api/           # API routes (Next.js App Router)
├── components/        # React components
├── services/         # Business logic and external service integrations
├── strategies/       # Processing strategy implementations
├── store/           # Zustand state management
├── utils/           # Utility functions
└── types/           # TypeScript type definitions
```

## 🎯 How to Contribute

### Reporting Issues
- Use the GitHub issue tracker
- Provide detailed reproduction steps
- Include environment information (OS, Node.js version, etc.)
- Add relevant logs or error messages

### Suggesting Features
- Open a GitHub issue with the "enhancement" label
- Describe the use case and expected behavior
- Consider implementation complexity and maintenance burden

### Code Contributions

#### 1. Find or Create an Issue
- Look for issues labeled "good first issue" for beginners
- Comment on the issue to indicate you're working on it
- For new features, discuss the approach first

#### 2. Development Workflow
```bash
# Create a feature branch
git checkout -b feature/your-feature-name

# Make your changes
# ...

# Run tests and linting
npm run lint
npm run build

# Commit with descriptive messages
git commit -m "feat: add batch retry functionality"

# Push to your fork
git push origin feature/your-feature-name

# Open a pull request
```

#### 3. Pull Request Guidelines
- **Title**: Use conventional commit format (`feat:`, `fix:`, `docs:`, etc.)
- **Description**: Explain what changes you made and why
- **Testing**: Describe how you tested your changes
- **Breaking Changes**: Clearly document any breaking changes

## 📝 Coding Standards

### TypeScript
- Use strict TypeScript configuration
- Provide explicit types for function parameters and return values
- Use interfaces for object shapes
- Follow existing naming conventions

### React Components
- Use functional components with hooks
- Implement proper error boundaries
- Follow the existing component structure
- Use TypeScript for props and state

### API Routes
- Follow REST conventions where applicable
- Include proper error handling
- Use consistent response formats
- Add logging for debugging

### Code Style
- Use Prettier for formatting (runs automatically)
- Follow ESLint rules
- Use meaningful variable and function names
- Add comments for complex logic

## 🧪 Testing

### Manual Testing
- Test with various audio file formats
- Test both local and cloud processing
- Verify batch processing workflows
- Test YouTube integration with different video types

### Automated Testing
We welcome contributions to add automated testing:
- Unit tests for utility functions
- Integration tests for API endpoints
- Component testing for React components

## 🔧 Development Tips

### Local Whisper Development
- Use smaller models (`tiny`, `base`) for faster development
- Models are downloaded automatically on first use
- Check logs for model download progress

### Batch Processing Development
- Set up Vercel Blob storage for testing
- Use short completion windows (24h) for faster feedback
- Monitor the Groq dashboard for batch job status

### Database Development
- SQLite database is created automatically
- Database schema is in `src/lib/database.ts`
- Use DB Browser for SQLite for manual inspection

## 🚀 Areas for Contribution

### High Priority
- [ ] Automated testing suite
- [ ] Performance optimizations
- [ ] Better error handling and user feedback
- [ ] Accessibility improvements

### Medium Priority
- [ ] Additional cloud providers (OpenAI, Azure)
- [ ] Real-time streaming transcription
- [ ] Advanced audio preprocessing
- [ ] Multi-language UI support

### Low Priority
- [ ] User authentication system
- [ ] API rate limiting
- [ ] Custom model fine-tuning
- [ ] Advanced analytics dashboard

## 📋 Commit Message Format

We use conventional commits for consistent commit messages:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples
```
feat(batch): add retry functionality for failed items
fix(youtube): handle private video URLs gracefully
docs: update installation instructions
refactor(api): extract common validation logic
```

## 🤝 Code Review Process

1. **Automated Checks**: Ensure all CI checks pass
2. **Manual Review**: Maintainer will review code and functionality
3. **Feedback**: Address any requested changes
4. **Approval**: Once approved, your PR will be merged

## 📞 Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Code Questions**: Comment on relevant issues or PRs

## 🙏 Recognition

Contributors will be:
- Added to the README acknowledgments
- Mentioned in release notes for significant contributions
- Credited in commit messages and PR descriptions

Thank you for contributing to make audio transcription more accessible and powerful for everyone!