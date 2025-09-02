# Self-Referencing Hierarchical DataGrid

This document describes the new self-referencing hierarchical functionality added to MudBlazor's DataGrid component.

## Overview

The self-referencing hierarchical view allows DataGrid to display items that have parent-child relationships of the same type, such as tasks with subtasks, organizational structures, or file/folder hierarchies. When enabled, child items are displayed inline with proper indentation to show the hierarchy structure.

## Key Features

- **Nested Display**: Child items are shown inline within the same DataGrid with visual indentation
- **Expand/Collapse**: Interactive expand/collapse functionality for items with children
- **Perfect Alignment**: Non-indented columns maintain perfect alignment across all hierarchy levels
- **Performance Optimized**: Efficient rendering with lazy evaluation and caching
- **Safety Features**: Protection against circular references and infinite recursion

## Usage

### Basic Setup

```razor
<MudDataGrid T="TaskItem" 
             Items="@tasks" 
             SelfReferencingHierarchy="true" 
             ChildrenSelector="@(item => item.SubTasks)">
    <Columns>
        <HierarchyColumn />
        <PropertyColumn Property="x => x.Name" Title="Task Name" />
        <PropertyColumn Property="x => x.Status" Title="Status" />
        <PropertyColumn Property="x => x.Priority" Title="Priority" />
    </Columns>
</MudDataGrid>
```

### Data Model

Your data model needs to have a property that returns child items of the same type:

```csharp
public class TaskItem
{
    public string Name { get; set; }
    public string Status { get; set; }
    public int Priority { get; set; }
    public List<TaskItem> SubTasks { get; set; } = new();
}
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `SelfReferencingHierarchy` | `bool` | `false` | Enables self-referencing hierarchical view |
| `ChildrenSelector` | `Func<T, IEnumerable<T>>` | `null` | Function that returns children for a given item |
| `HierarchyIndentationSize` | `int` | `24` | Indentation size in pixels for each hierarchy level |

## Event Handling

The existing `HierarchyVisibilityToggled` event works with self-referencing hierarchies:

```razor
<MudDataGrid T="TaskItem" 
             Items="@tasks" 
             SelfReferencingHierarchy="true" 
             ChildrenSelector="@(item => item.SubTasks)"
             HierarchyVisibilityToggled="@OnHierarchyToggled">
    <!-- columns -->
</MudDataGrid>

@code {
    private Task OnHierarchyToggled(DataGridHierarchyVisibilityToggledEventArgs<TaskItem> args)
    {
        Console.WriteLine($"Item {args.Item.Name} is now {(args.IsExpanded ? "expanded" : "collapsed")}");
        return Task.CompletedTask;
    }
}
```

## Important Notes

### Column Indentation
- Only the first data column (excluding HierarchyColumn and SelectColumn) receives indentation
- Other columns maintain perfect alignment across all hierarchy levels
- Indentation is applied via CSS `padding-left` style

### Performance Considerations
- The component builds a flattened hierarchy structure for efficient rendering
- Large hierarchies (1000+ items) are supported with good performance
- Expansion state changes trigger minimal re-rendering

### Safety Features
- **Circular Reference Protection**: Prevents infinite loops if data contains circular references
- **Depth Limiting**: Maximum hierarchy depth of 50 levels prevents stack overflow
- **Null Safety**: Handles null items and empty collections gracefully
- **Error Handling**: Falls back to regular filtered items if hierarchy building fails

### Limitations
- Self-referencing hierarchy is incompatible with DataGrid grouping
- Virtual scrolling works but may have reduced efficiency with very deep hierarchies
- Pagination counts visible items, not total items in the hierarchy

## Examples

See the test components in `MudBlazor.UnitTests.Viewer/TestComponents/DataGrid/`:
- `SimpleHierarchyTest.razor` - Basic hierarchy example
- `ComprehensiveHierarchyExample.razor` - Full-featured task management example
- `CircularReferenceTest.razor` - Demonstrates circular reference protection

## Migration from Traditional Hierarchy

If you're currently using the traditional hierarchy approach with `ChildRowContent`, you can migrate to self-referencing hierarchy:

**Before (Traditional):**
```razor
<MudDataGrid T="TaskItem" Items="@tasks">
    <Columns>
        <HierarchyColumn />
        <PropertyColumn Property="x => x.Name" />
    </Columns>
    <ChildRowContent>
        <!-- Custom child content here -->
    </ChildRowContent>
</MudDataGrid>
```

**After (Self-Referencing):**
```razor
<MudDataGrid T="TaskItem" 
             Items="@tasks"
             SelfReferencingHierarchy="true" 
             ChildrenSelector="@(item => item.SubTasks)">
    <Columns>
        <HierarchyColumn />
        <PropertyColumn Property="x => x.Name" />
    </Columns>
</MudDataGrid>
```

The self-referencing approach provides better alignment, performance, and user experience for hierarchical data of the same type.