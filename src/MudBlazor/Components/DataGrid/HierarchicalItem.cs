// Copyright (c) MudBlazor 2021
// MudBlazor licenses this file to you under the MIT license.
// See the LICENSE file in the project root for more information.

using System.Diagnostics.CodeAnalysis;

namespace MudBlazor;

/// <summary>
/// Represents a hierarchical item wrapper for self-referencing data in a <see cref="MudDataGrid{T}"/>.
/// </summary>
/// <typeparam name="T">The type of the item.</typeparam>
internal class HierarchicalItem<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.PublicProperties)] T>
{
    /// <summary>
    /// The actual item data.
    /// </summary>
    public required T Item { get; init; }
    
    /// <summary>
    /// The depth level of this item in the hierarchy (0-based).
    /// </summary>
    public int Level { get; init; }
    
    /// <summary>
    /// The parent hierarchical item, if any.
    /// </summary>
    public HierarchicalItem<T> Parent { get; init; }
    
    /// <summary>
    /// Whether this item has children.
    /// </summary>
    public bool HasChildren { get; init; }
    
    /// <summary>
    /// Whether this item is expanded (children are visible).
    /// </summary>
    public bool IsExpanded { get; set; }
    
    /// <summary>
    /// Gets the indentation padding for this item based on its level.
    /// </summary>
    /// <param name="indentationSize">The size of indentation per level in pixels.</param>
    /// <returns>The padding-left CSS value.</returns>
    public string GetIndentationStyle(int indentationSize = 24)
    {
        return Level > 0 ? $"padding-left: {Level * indentationSize}px;" : string.Empty;
    }
}
