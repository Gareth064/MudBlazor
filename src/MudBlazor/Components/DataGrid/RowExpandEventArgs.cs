// Copyright (c) MudBlazor 2021
// MudBlazor licenses this file to you under the MIT license.
// See the LICENSE file in the project root for more information.

namespace MudBlazor;

/// <summary>
/// Provides data for tree row expand/collapse events in <see cref="MudDataGrid{T}"/>.
/// </summary>
/// <typeparam name="T">The type of data represented by each row in the grid.</typeparam>
public sealed class RowExpandEventArgs<T>
{
    /// <summary>
    /// The item that was expanded or collapsed.
    /// </summary>
    public required T Item { get; init; }

    /// <summary>
    /// The unique key identifying the item.
    /// </summary>
    public required string ItemKey { get; init; }

    /// <summary>
    /// The nesting level of the item (0-based).
    /// </summary>
    public required int Level { get; init; }
}