# React Component Documenter

A powerful Node.js tool that extracts React components from your project and generates comprehensive JSDoc documentation using OpenAI. The tool is specifically designed to handle complex projects with multiple components per file and existing documentation.

## Key Features

- **File-by-file processing** to maintain accurate component positions
- **Position tracking** that adjusts for documentation inserts/updates
- **AI-powered documentation** that analyzes component code structure
- **Handles multiple components per file** correctly
- **Detects and updates existing documentation** when requested
- **Concurrent processing** for faster documentation generation
- **Smart batching** to respect OpenAI API rate limits

## Installation

1. Clone this repository
2. Install the required dependencies:

```bash
npm install
```

3. Set up your OpenAI API key (recommended for best results):

```bash
export OPENAI_API_KEY=your-api-key-here
```

## Usage

Run the tool on your React project:

```bash
node component-doc-generator.js /path/to/your/project
```

The tool will:
1. Scan your project for React components
2. Generate appropriate JSDoc documentation for each component
3. Update source files with the documentation, properly maintaining component positions

## Command Line Options

```
Options:
  --output, -o          Output directory for extracted components
                                             [default: "extracted_components"]
  --verbose, -v         Enable verbose logging      [boolean] [default: false]
  --openai-key, -k      OpenAI API Key (or set OPENAI_API_KEY environment variable)
  --rate-limit, -r      Maximum number of OpenAI API requests per minute
                                                          [number] [default: 10]
  --dry-run, -d         Generate docstrings but don't write to files
                                                     [boolean] [default: false]
  --skip-existing, -s   Skip components with existing comments
                                                     [boolean] [default: false]
  --update-existing, -u Update existing component comments
                                                     [boolean] [default: false]
  --batch-size, -b      Number of components to process concurrently
                                                           [number] [default: 5]
  --help, -h            Show help                                   [boolean]
```

## Advanced Usage Examples

### Dry Run Mode

Preview documentation without modifying files:

```bash
node component-doc-generator.js /path/to/your/project --dry-run
```

### Update Existing Documentation

Replace existing JSDoc comments:

```bash
node component-doc-generator.js /path/to/your/project --update-existing
```

### Skip Components with Existing Documentation

Only document components that don't already have JSDoc comments:

```bash
node component-doc-generator.js /path/to/your/project --skip-existing
```

### Control Batch Size

Adjust the number of components processed concurrently:

```bash
node component-doc-generator.js /path/to/your/project --batch-size 10
```

### Limit API Requests

For stricter API limits:

```bash
node component-doc-generator.js /path/to/your/project --rate-limit 5
```

## How It Works

1. **Component Extraction**
   - Parses JavaScript/TypeScript files with Babel
   - Identifies React components (function, class, arrow function, styled)
   - Detects existing documentation blocks
   - Records exact position of each component in source files

2. **Documentation Generation**
   - Groups components by file
   - Processes components in concurrent batches
   - Uses OpenAI to analyze component structure
   - Generates comprehensive JSDoc comments with prop types

3. **File Updating**
   - Processes files in order, one at a time
   - For each file, sorts components by position
   - Updates components from bottom to top to maintain positions
   - Tracks position adjustments after each insert/update
   - Updates or inserts documentation as specified

## Example Generated Documentation

```jsx
/**
 * ProductCard Component
 * 
 * @description Displays a product with its image, title, price, and rating
 * 
 * @component FunctionComponent
 * @param {Object} props - Component properties
 * @param {Object} props.product - Product information
 * @param {string} props.product.id - Unique identifier for the product
 * @param {string} props.product.title - Product title
 * @param {number} props.product.price - Product price
 * @param {string} props.product.image - URL to product image
 * @param {number} props.product.rating - Product rating (1-5)
 * @param {Function} props.onAddToCart - Callback when Add to Cart is clicked
 * @param {boolean} [props.featured=false] - Whether to show as featured product
 * 
 * @returns {React.ReactElement} A card displaying the product information
 * 
 * @example
 * <ProductCard 
 *   product={{
 *     id: "1",
 *     title: "Smartphone",
 *     price: 699,
 *     image: "/images/smartphone.jpg",
 *     rating: 4.5
 *   }}
 *   onAddToCart={() => handleAddToCart("1")}
 *   featured={true}
 * />
 */
function ProductCard({ product, onAddToCart, featured = false }) {
  // Component implementation...
}
```

## Dependencies

- @babel/parser - For parsing JavaScript/TypeScript files
- @babel/traverse - For traversing the AST to find components
- @babel/types - For type checking in AST nodes
- minimatch - For .gitignore pattern matching
- openai - For AI-powered documentation generation
- yargs - For command-line argument parsing
